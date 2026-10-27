-- Limites de plano, assinaturas, convites, pedidos, rascunhos e fila.
begin;
create extension if not exists pgtap with schema extensions;
select plan(39);

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

select tests.create_user('alice@a.test');
select tests.create_user('bob@b.test');
select tests.create_user('carol@c.test');

select tests.login('alice@a.test');
select public.create_organization('Empresa A', 'empresa-a');
select tests.logout();
select tests.login('bob@b.test');
select public.create_organization('Empresa B', 'empresa-b');
select tests.logout();

create temp table ids as
select (select id from public.organizations where slug = 'empresa-a') as org_a,
       (select id from public.organizations where slug = 'empresa-b') as org_b;
grant select on ids to authenticated, service_role;

-- Limites do plano ------------------------------------------------------------
update public.plans set limits = limits || '{"max_products": 2}' where code = 'free';
select tests.login('alice@a.test');
insert into public.catalog_products (organization_id, title, normalized_title) select org_a, 'Produto 1', 'produto 1' from ids;
insert into public.catalog_products (organization_id, title, normalized_title) select org_a, 'Produto 2', 'produto 2' from ids;
select throws_ok(
  $$ insert into public.catalog_products (organization_id, title, normalized_title) select org_a, 'Produto 3', 'produto 3' from ids $$,
  'P0001', null, 'limite de produtos do plano aplicado no banco');
select tests.logout();

-- Assinatura de desenvolvimento não vale em produção
insert into public.subscriptions (organization_id, provider, plan_code, status)
select org_a, 'development', 'pro', 'active' from ids;
select is(private.effective_plan_code((select org_a from ids)), 'pro', 'assinatura de desenvolvimento vale fora de produção');
update private.app_settings set value = 'production' where key = 'environment';
select is(private.effective_plan_code((select org_a from ids)), 'free', 'assinatura de desenvolvimento é ignorada em produção');
update private.app_settings set value = 'development' where key = 'environment';
select is((select count(*)::int from public.subscription_events e join ids on e.organization_id = ids.org_a), 2,
  'histórico registra criação das assinaturas');

select tests.login('alice@a.test');
select throws_ok(
  $$ insert into public.subscriptions (organization_id, provider, plan_code, status) select org_a, 'internal', 'business', 'active' from ids $$,
  '42501', null, 'usuário não cria assinatura pela API');
select throws_ok($$ update public.subscriptions set status = 'active' $$, '42501', null, 'usuário não altera assinatura');
select tests.logout();

-- Convites ----------------------------------------------------------------------
select tests.login('alice@a.test');
select lives_ok(
  $$ insert into public.organization_invitations (organization_id, email, role, token_hash, invited_by, expires_at)
     select org_a, 'carol@c.test', 'operator', encode(extensions.digest('token-carol', 'sha256'), 'hex'), tests.uid('alice@a.test'), now() + interval '7 days' from ids $$,
  'admin cria convite');
select throws_ok(
  $$ insert into public.organization_invitations (organization_id, email, role, token_hash, invited_by, expires_at)
     select org_a, 'x@c.test', 'owner', 'h1', tests.uid('alice@a.test'), now() + interval '7 days' from ids $$,
  '23514', null, 'convite não pode conceder papel owner');
select throws_ok($$ select token_hash from public.organization_invitations $$, '42501', null, 'hash do token não é legível');
select tests.logout();

select tests.login('bob@b.test');
select throws_ok($$ select public.accept_invitation('token-carol') $$, '42501', null, 'convite não aceito por outro e-mail');
select throws_ok($$ select public.accept_invitation('token-errado') $$, 'P0001', null, 'token inválido é rejeitado');
select tests.logout();

select tests.login('carol@c.test');
select is(public.accept_invitation('token-carol'), (select org_a from ids), 'convidado aceita convite');
select is((select role::text from public.organization_members where user_id = tests.uid('carol@c.test')), 'operator', 'papel do convite aplicado');
select throws_ok($$ select public.accept_invitation('token-carol') $$, 'P0001', null, 'convite não pode ser reutilizado');
select tests.logout();

select is((select count(*)::int from public.audit_logs a join ids on a.organization_id = ids.org_a where action = 'member.insert'), 2,
  'entrada de membros é auditada');

-- Pedidos e máquina de estados do pedido de compra ------------------------------
insert into public.marketplace_accounts (organization_id, marketplace, external_account_id, nickname)
select org_a, 'mercado_livre', '123456', 'LOJA_A' from ids;
insert into public.supplier_connections (organization_id, supplier_source_id, display_name)
select org_a, (select id from public.supplier_sources where adapter_key = 'manual'), 'Fornecedor A' from ids;
insert into public.orders (organization_id, marketplace_account_id, external_order_id, status, total_amount)
select org_a, (select id from public.marketplace_accounts where external_account_id = '123456'), '2000001', 'paid', 100 from ids;
select throws_ok(
  $$ insert into public.orders (organization_id, marketplace_account_id, external_order_id, status, total_amount)
     select org_a, (select id from public.marketplace_accounts where external_account_id = '123456'), '2000001', 'paid', 100 from ids $$,
  '23505', null, 'pedido externo duplicado é rejeitado');
select throws_ok(
  $$ insert into public.marketplace_accounts (organization_id, marketplace, external_account_id) select org_b, 'mercado_livre', '123456' from ids $$,
  '23505', null, 'mesma conta do marketplace não conecta em duas organizações');

select tests.login('carol@c.test');
select lives_ok(
  $$ insert into public.supplier_purchase_orders (organization_id, supplier_connection_id, order_id)
     select org_a, (select id from public.supplier_connections where display_name = 'Fornecedor A'), (select id from public.orders where external_order_id = '2000001') from ids $$,
  'operator cria pedido de compra manual');
select throws_ok(
  $$ insert into public.supplier_purchase_orders (organization_id, supplier_connection_id, order_id)
     select org_a, (select id from public.supplier_connections where display_name = 'Fornecedor A'), (select id from public.orders where external_order_id = '2000001') from ids $$,
  '23505', null, 'apenas um pedido de compra ativo por pedido e fornecedor');
select throws_ok($$ update public.supplier_purchase_orders set status = 'delivered' $$, 'P0001', null, 'transição draft -> delivered bloqueada');
select lives_ok($$ update public.supplier_purchase_orders set status = 'submitted' $$, 'transição draft -> submitted permitida');
select isnt((select submitted_by from public.supplier_purchase_orders), null, 'responsável pelo envio registrado');
select throws_ok(
  $$ insert into public.supplier_purchase_orders (organization_id, supplier_connection_id, order_id, submission_method)
     select org_a, (select id from public.supplier_connections where display_name = 'Fornecedor A'), (select id from public.orders where external_order_id = '2000001'), 'api' from ids $$,
  '42501', null, 'usuário não registra envio via API sem integração');
select throws_ok($$ update public.orders set status = 'cancelled' $$, '42501', null, 'status do marketplace não é editável pelo usuário');
select tests.logout();

-- Rascunho de anúncio: alteração invalida validação; publicado fica travado --------
insert into public.listing_drafts (organization_id, catalog_product_id, title, status, validated_at, created_by)
select org_a, (select id from public.catalog_products where title = 'Produto 1'), 'Título', 'validated', now(), tests.uid('alice@a.test') from ids;
select tests.login('carol@c.test');
update public.listing_drafts set target_price = 99.90;
select is((select status::text from public.listing_drafts), 'draft', 'alteração de conteúdo volta o rascunho para draft');
select throws_ok($$ update public.listing_drafts set status = 'published' $$, '42501', null, 'usuário não marca rascunho como publicado');
select tests.logout();
update public.listing_drafts set status = 'published';
select tests.login('carol@c.test');
select throws_ok($$ update public.listing_drafts set target_price = 10 $$, 'P0001', null, 'rascunho publicado não pode ser alterado');
select tests.logout();

-- Fila durável --------------------------------------------------------------------
set local role service_role;
select isnt(public.enqueue_sync_job((select org_a from ids), 'orders.sync', '{"id": 1}', 'dedup-1'), null, 'tarefa enfileirada');
select is(public.enqueue_sync_job((select org_a from ids), 'orders.sync', '{"id": 1}', 'dedup-1'),
          (select id from public.sync_jobs where deduplication_key = 'dedup-1'), 'enfileiramento duplicado retorna a tarefa existente');
select is((select count(*)::int from public.sync_jobs where deduplication_key = 'dedup-1'), 1, 'sem tarefas duplicadas');
select is((select count(*)::int from public.claim_sync_jobs('w1', 10, 300)), 1, 'worker reserva a tarefa');
select is((select count(*)::int from public.claim_sync_jobs('w2', 10, 300)), 0, 'outro worker não reserva tarefa em execução');
select is(public.complete_sync_job((select id from public.sync_jobs where deduplication_key = 'dedup-1'), 'w2', null), false,
  'worker sem a reserva não conclui a tarefa');
select is(public.fail_sync_job((select id from public.sync_jobs where deduplication_key = 'dedup-1'), 'w1', 'timeout', true, 30)::text,
  'pending', 'falha temporária reagenda');
select ok((select available_at > now() from public.sync_jobs where deduplication_key = 'dedup-1'), 'backoff aplicado');
update public.sync_jobs set available_at = now() - interval '1 second', max_attempts = 2 where deduplication_key = 'dedup-1';
select is((select count(*)::int from public.claim_sync_jobs('w1', 10, 300)), 1, 'tarefa reagendada é reservada novamente');
select is(public.fail_sync_job((select id from public.sync_jobs where deduplication_key = 'dedup-1'), 'w1', 'timeout', true, 30)::text,
  'dead', 'tentativas esgotadas encerram a tarefa');
select ok(public.retry_sync_job((select id from public.sync_jobs where deduplication_key = 'dedup-1')), 'reprocessamento manual possível');
-- Tarefa abandonada (lease expirado) é recuperada
update public.sync_jobs set status = 'running', locked_at = now() - interval '1 hour', locked_by = 'morto', attempts = 0
  where deduplication_key = 'dedup-1';
select is((select locked_by from public.claim_sync_jobs('w3', 10, 300)), 'w3', 'tarefa abandonada é recuperada por outro worker');
reset role;

select * from finish();
rollback;
