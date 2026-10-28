-- Varredura de segurança do esquema e isolamento em TODAS as tabelas de empresa.
begin;
create extension if not exists pgtap with schema extensions;
select plan(15);

-- 1. Catálogo do esquema --------------------------------------------------------
select is(
  (select array_agg(tablename::text order by tablename) from pg_tables where schemaname = 'public' and not rowsecurity),
  null, 'todas as tabelas públicas têm RLS habilitado');

select is(
  (select count(*)::int from information_schema.role_table_grants where grantee = 'anon' and table_schema = 'public'),
  0, 'anon não tem privilégios em tabelas públicas');

select is(
  (select count(*)::int from information_schema.role_table_grants where grantee in ('anon', 'authenticated') and table_schema = 'private'),
  0, 'usuários não têm privilégios no schema private');

select is(
  (select count(*)::int from pg_policies where schemaname = 'public' and (roles @> '{anon}' or roles @> '{public}')),
  0, 'nenhuma política RLS para anon/public');

select is(
  (select array_agg(p.proname::text order by p.proname) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and has_function_privilege('anon', p.oid, 'execute')),
  null, 'anon não executa funções públicas');

select is(
  (select array_agg(p.proname::text order by p.proname) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and has_function_privilege('authenticated', p.oid, 'execute')),
  array['accept_invitation', 'create_organization', 'organization_plan', 'upsert_catalog_rows'],
  'usuários executam apenas as funções públicas previstas');

select is(
  (select array_agg(n.nspname || '.' || p.proname order by n.nspname, p.proname) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname in ('public', 'private') and p.prosecdef),
  array[
    'private.audit_membership_change', 'private.create_default_subscription', 'private.effective_plan_code', 'private.enforce_plan_limit',
    'private.handle_new_user', 'private.handle_user_email_change', 'private.has_org_role', 'private.is_platform_admin',
    'private.log_subscription_change', 'private.org_ids_with_role', 'private.plan_limit',
    'public.accept_invitation', 'public.create_organization', 'public.ingest_marketplace_order',
    'public.mp_claim_refresh', 'public.mp_complete_refresh', 'public.mp_delete_credentials', 'public.mp_get_credentials',
    'public.mp_release_refresh', 'public.mp_store_credentials', 'public.oauth_state_consume', 'public.oauth_state_create',
    'public.rate_limit_hit'
  ],
  'funções SECURITY DEFINER restritas à lista revisada (docs/security.md)');

select is(
  (select array_agg(p.proname::text order by p.proname) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname in ('public', 'private') and p.prosecdef
     and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) c where c like 'search_path=%')),
  null, 'toda função SECURITY DEFINER fixa search_path');

select is(
  (select array_agg(c.table_name::text order by c.table_name) from information_schema.columns c
   where c.table_schema = 'public' and c.column_name = 'organization_id'
     and c.table_name not in ('webhook_events', 'sync_jobs', 'integration_errors', 'marketplace_fee_snapshots')
     and c.is_nullable = 'YES'),
  null, 'organization_id é obrigatório nas tabelas de empresa');

-- 2. Isolamento em todas as tabelas com organization_id ---------------------------
-- Auxiliares (descartados no rollback) -------------------------------------
create schema tests;
create function tests.create_user(p_email text) returns uuid language plpgsql as $$
declare uid uuid := gen_random_uuid();
begin
  insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at)
  values (uid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', p_email, '{}', now(), now());
  return uid;
end $$;
create function tests.login(p_email text) returns void language plpgsql as $$
declare uid uuid;
begin
  select id into uid from auth.users where email = p_email;
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated', 'email', p_email)::text, true);
end $$;
create function tests.uid(p_email text) returns uuid language sql security definer as $$ select id from auth.users where email = p_email $$;
create function tests.logout() returns void language plpgsql as $$
begin
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', '', true);
end $$;
grant usage on schema tests to authenticated, anon;
grant execute on all functions in schema tests to authenticated, anon;

update public.plans set limits = '{}'::jsonb where code = 'free';
select tests.create_user('ana@a.test');
select tests.create_user('bia@b.test');
select tests.login('ana@a.test');
select public.create_organization('Empresa A', 'empresa-a');
select tests.logout();
select tests.login('bia@b.test');
select public.create_organization('Empresa B', 'empresa-b');
select tests.logout();

-- Semeia uma linha de cada tabela de empresa para a organização A (como superusuário).
do $$
declare
  a uuid := (select id from public.organizations where slug = 'empresa-a');
  u uuid := tests.uid('ana@a.test');
  conn uuid; prod uuid; offer uuid; acc uuid; listing uuid; draft uuid; prof uuid; ver uuid; ord uuid; po uuid;
begin
  insert into public.supplier_connections (organization_id, supplier_source_id, display_name)
    values (a, (select id from public.supplier_sources where adapter_key = 'manual'), 'Fornecedor') returning id into conn;
  insert into public.catalog_products (organization_id, title, normalized_title) values (a, 'Produto', 'produto') returning id into prod;
  insert into public.supplier_offers (organization_id, supplier_connection_id, supplier_source_id, catalog_product_id, sku, supplier_cost, source)
    values (a, conn, (select id from public.supplier_sources where adapter_key = 'manual'), prod, 'S1', 10, 'manual') returning id into offer;
  insert into public.catalog_import_runs (organization_id, supplier_connection_id, file_name, file_type, file_sha256, created_by)
    values (a, conn, 'a.csv', 'csv', repeat('a', 64), u);
  insert into public.competitor_snapshots (organization_id, marketplace, external_item_id, catalog_product_id, observed_price, source)
    values (a, 'mercado_livre', 'MLB1', prod, 10, 'manual');
  insert into public.marketplace_accounts (organization_id, marketplace, external_account_id) values (a, 'mercado_livre', 'x1') returning id into acc;
  insert into public.listing_drafts (organization_id, catalog_product_id, created_by) values (a, prod, u) returning id into draft;
  insert into public.marketplace_listings (organization_id, marketplace_account_id, external_item_id, status) values (a, acc, 'MLB9', 'active') returning id into listing;
  insert into public.listing_variants (organization_id, marketplace_listing_id, external_variant_id) values (a, listing, 'v1');
  insert into public.pricing_profiles (organization_id, name, target_margin) values (a, 'Perfil', 0.1) returning id into prof;
  insert into public.pricing_rule_versions (organization_id, profile_id, rules, created_by) values (a, prof, '{}', u) returning id into ver;
  insert into public.pricing_calculations (organization_id, catalog_product_id, input_snapshot, result_snapshot, cost_total, selling_price,
    estimated_fees, estimated_tax, estimated_profit, calculation_version, has_estimates, created_by)
    values (a, prod, '{}', '{}', 1, 2, 0, 0, 1, 't', true, u);
  insert into public.marketplace_fee_snapshots (organization_id, marketplace, listing_type, variable_fee_rate, source) values (a, 'mercado_livre', 'gold_special', 0.1, 'manual');
  insert into public.orders (organization_id, marketplace_account_id, external_order_id, status, total_amount) values (a, acc, '1', 'paid', 10) returning id into ord;
  insert into public.order_items (organization_id, order_id, external_item_id, quantity, unit_price, item_total) values (a, ord, 'MLB9', 1, 10, 10);
  insert into public.supplier_purchase_orders (organization_id, supplier_connection_id, order_id) values (a, conn, ord) returning id into po;
  insert into public.shipments (organization_id, supplier_purchase_order_id, tracking_code) values (a, po, 'BR1');
  insert into public.webhook_events (marketplace, event_key, resource, topic, organization_id) values ('mercado_livre', 'k1', '/orders/1', 'orders_v2', a);
  insert into public.sync_jobs (organization_id, job_type) values (a, 'test.job');
  insert into public.integration_errors (organization_id, integration_type, message) values (a, 'test', 'erro');
  insert into public.usage_records (organization_id, metric, quantity, period_start, period_end) values (a, 'm', 1, now(), now() + interval '1 day');
  insert into public.organization_invitations (organization_id, email, role, token_hash, invited_by, expires_at) values (a, 'x@y.z', 'viewer', 'h', u, now() + interval '1 day');
end $$;

create temp table tenant_tables as
select c.table_name::text as t
from information_schema.columns c
join information_schema.tables tb on tb.table_schema = c.table_schema and tb.table_name = c.table_name and tb.table_type = 'BASE TABLE'
where c.table_schema = 'public' and c.column_name = 'organization_id';
grant select on tenant_tables to authenticated;

create temp table baseline as
select t, 0 as n from tenant_tables;
grant select on baseline to authenticated;
do $$
declare r record; cnt int;
begin
  for r in select t from tenant_tables loop
    execute format('select count(*) from public.%I where organization_id = (select id from public.organizations where slug = %L)', r.t, 'empresa-a') into cnt;
    update baseline set n = cnt where t = r.t;
  end loop;
end $$;

select is((select array_agg(t order by t) from baseline where n = 0), null, 'todas as tabelas de empresa têm dados semeados para o teste');

-- Bia (outra empresa) tenta ler, alterar e apagar dados da empresa A em todas as tabelas.
create temp table leaks (t text, op text, n int);
grant all on leaks to authenticated;
select tests.login('bia@b.test');
do $$
declare r record; n int; a uuid := (select id from public.organizations where slug = 'empresa-a');
begin
  for r in select t from tenant_tables loop
    begin
      execute format('select count(*) from public.%I where organization_id = %L', r.t, a) into n;
      if n > 0 then insert into leaks values (r.t, 'select', n); end if;
    exception when insufficient_privilege then null;
    end;
    begin
      execute format('with u as (update public.%I set organization_id = organization_id where organization_id = %L returning 1) select count(*) from u', r.t, a) into n;
      if n > 0 then insert into leaks values (r.t, 'update', n); end if;
    exception when insufficient_privilege then null;
    end;
    begin
      execute format('with d as (delete from public.%I where organization_id = %L returning 1) select count(*) from d', r.t, a) into n;
      if n > 0 then insert into leaks values (r.t, 'delete', n); end if;
    exception when insufficient_privilege or foreign_key_violation then null;
    end;
  end loop;
end $$;
select tests.logout();
select is((select array_agg(t || ':' || op order by t, op) from leaks), null, 'outra empresa não lê, altera nem apaga nenhuma tabela da empresa A');

create temp table after_counts as select t, 0 as n from tenant_tables;
do $$
declare r record; cnt int;
begin
  for r in select t from tenant_tables loop
    execute format('select count(*) from public.%I where organization_id = (select id from public.organizations where slug = %L)', r.t, 'empresa-a') into cnt;
    update after_counts set n = cnt where t = r.t;
  end loop;
end $$;
select is((select array_agg(b.t order by b.t) from baseline b join after_counts c using (t) where b.n <> c.n), null, 'nenhuma linha da empresa A foi alterada em volume');

-- Bia não consegue inserir em nenhuma tabela apontando para a empresa A (tabelas com insert permitido).
select tests.login('bia@b.test');
select throws_ok(
  $$ insert into public.listing_drafts (organization_id, catalog_product_id, created_by)
     values ((select id from public.organizations where slug = 'empresa-a'), gen_random_uuid(), tests.uid('bia@b.test')) $$,
  '42501', null, 'inserção cruzada bloqueada (rascunhos)');
select tests.logout();

-- Imagens de produto: bucket público só para leitura; gravação apenas por URL assinada do servidor.
select is(
  (select row(public, file_size_limit, allowed_mime_types)::text from storage.buckets where id = 'product-images'),
  row(true, 10485760::bigint, array['image/jpeg', 'image/png', 'image/webp'])::text,
  'bucket product-images público, até 10 MB, só JPG/PNG/WEBP'
);
select is(
  (select count(*)::int from pg_policies where schemaname = 'storage' and tablename = 'objects'
     and ('anon' = any(roles) or 'authenticated' = any(roles) or 'public' = any(roles))),
  0,
  'nenhuma política em storage.objects para anon/authenticated'
);

select * from finish();
rollback;
