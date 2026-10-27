-- Isolamento multi-tenant, papéis, privilégios de coluna e referências cruzadas.
begin;
create extension if not exists pgtap with schema extensions;
select plan(37);

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

update public.plans set limits = limits || '{"max_members": 10}' where code = 'free';
select tests.create_user('alice@a.test');
select tests.create_user('bob@b.test');
select tests.create_user('vera@a.test');
select tests.create_user('otto@a.test');

-- Alice cria a organização A, Bob cria a B.
select tests.login('alice@a.test');
select lives_ok($$ select public.create_organization('Empresa A', 'empresa-a') $$, 'usuário autenticado cria organização');
select tests.logout();
select tests.login('bob@b.test');
select lives_ok($$ select public.create_organization('Empresa B', 'empresa-b') $$, 'segundo usuário cria outra organização');
select tests.logout();

create temp table ids as
select (select id from public.organizations where slug = 'empresa-a') as org_a,
       (select id from public.organizations where slug = 'empresa-b') as org_b;
grant select on ids to authenticated, service_role;

-- Vera é viewer e Otto é operator na organização A (inserção direta como superusuário).
insert into public.organization_members (organization_id, user_id, role)
select org_a, tests.uid('vera@a.test'), 'viewer' from ids;
insert into public.organization_members (organization_id, user_id, role)
select org_a, tests.uid('otto@a.test'), 'operator' from ids;

select is((select role::text from public.organization_members m join ids on m.organization_id = ids.org_a
           where user_id = tests.uid('alice@a.test')), 'owner', 'criador é owner');
select is((select count(*)::int from public.subscriptions s join ids on s.organization_id = ids.org_a), 1,
          'organização nasce com assinatura no plano padrão');

-- Dados da organização A
insert into public.supplier_connections (organization_id, supplier_source_id, display_name)
select org_a, (select id from public.supplier_sources where adapter_key = 'manual'), 'Fornecedor A' from ids;
insert into public.catalog_products (organization_id, title, normalized_title)
select org_a, 'Produto A', 'produto a' from ids;

-- Isolamento de leitura -----------------------------------------------------
select tests.login('bob@b.test');
select is((select count(*)::int from public.organizations), 1, 'Bob vê apenas a própria organização');
select is((select count(*)::int from public.catalog_products), 0, 'Bob não vê produtos da organização A');
select is((select count(*)::int from public.supplier_connections), 0, 'Bob não vê fornecedores da organização A');
select is((select count(*)::int from public.organization_members), 1, 'Bob vê somente sua associação');
select is((select count(*)::int from public.subscriptions), 1, 'Bob vê somente sua assinatura');
select is((select count(*)::int from public.profiles), 1, 'Bob vê somente o próprio perfil');

-- Isolamento de escrita -----------------------------------------------------
select throws_ok(
  $$ insert into public.catalog_products (organization_id, title, normalized_title) select org_a, 'Invasor', 'invasor' from ids $$,
  '42501', null, 'Bob não insere produto na organização A');
update public.catalog_products set title = 'hack' where title = 'Produto A';
delete from public.catalog_products where title = 'Produto A';
select tests.logout();
select is((select title from public.catalog_products where normalized_title = 'produto a'), 'Produto A',
          'update/delete de Bob em dados de A não têm efeito');

-- Papéis dentro da organização A ---------------------------------------------
select tests.login('vera@a.test');
select is((select count(*)::int from public.catalog_products), 1, 'viewer lê produtos');
select throws_ok(
  $$ insert into public.catalog_products (organization_id, title, normalized_title) select org_a, 'Viewer', 'viewer' from ids $$,
  '42501', null, 'viewer não insere produto');
update public.catalog_products set title = 'viewer edit';
select is((select count(*)::int from public.catalog_products where title = 'viewer edit'), 0, 'viewer não altera produto');
update public.organization_members set role = 'admin';
select tests.logout();
select is((select role::text from public.organization_members where user_id = tests.uid('vera@a.test')),
  'viewer', 'viewer não altera papéis');

select tests.login('otto@a.test');
select lives_ok(
  $$ insert into public.catalog_products (organization_id, title, normalized_title) select org_a, 'Produto do operador', 'produto do operador' from ids $$,
  'operator insere produto');
select throws_ok(
  $$ insert into public.supplier_connections (organization_id, supplier_source_id, display_name)
     select org_a, (select id from public.supplier_sources where adapter_key = 'manual'), 'Novo' from ids $$,
  '42501', null, 'operator não cria conexão de fornecedor (admin+)');
delete from public.catalog_products where title = 'Produto do operador';
select is((select count(*)::int from public.catalog_products where title = 'Produto do operador'), 1,
  'operator não exclui produto (admin+)');
select tests.logout();

-- Privilégios de coluna: organization_id não pode ser alterado pela API ----------
select tests.login('alice@a.test');
select throws_ok(
  $$ update public.catalog_products set organization_id = (select org_b from ids) $$,
  '42501', null, 'organization_id não é atualizável pelo cliente');
select throws_ok(
  $$ update public.organizations set slug = 'novo-slug' $$,
  '42501', null, 'slug da organização não é atualizável pelo cliente');
select throws_ok(
  $$ update public.organizations set status = 'active' $$,
  '42501', null, 'status da organização não é atualizável pelo cliente');
select lives_ok($$ update public.organizations set name = 'Empresa A Ltda' where slug = 'empresa-a' $$,
  'owner altera nome da organização');

-- Promoção a owner e remoção do owner são bloqueadas para admins
select tests.logout();
update public.organization_members set role = 'admin'
  where user_id = tests.uid('otto@a.test');
select tests.login('otto@a.test');
select throws_ok($$ update public.organization_members set role = 'owner'
  where user_id = tests.uid('vera@a.test') $$, '42501', null, 'admin recebe erro ao tentar promover a owner');
delete from public.organization_members where role = 'owner';
select tests.logout();
select is((select role::text from public.organization_members where user_id = tests.uid('vera@a.test')),
  'viewer', 'admin não promove ninguém a owner');
select is((select count(*)::int from public.organization_members m join ids on m.organization_id = ids.org_a where role = 'owner'), 1,
  'admin não remove o owner');

-- Trigger impede mover registros entre organizações mesmo para o service role
select throws_ok(
  $$ update public.catalog_products set organization_id = (select org_b from ids) where normalized_title = 'produto a' $$,
  '42501', 'organization_id não pode ser alterado', 'trigger bloqueia troca de organização');

-- Referência cruzada entre organizações -------------------------------------
-- Alice passa a ser membro de B também; tenta criar oferta em B apontando para produto de A.
insert into public.organization_members (organization_id, user_id, role)
select org_b, tests.uid('alice@a.test'), 'admin' from ids;
insert into public.supplier_connections (organization_id, supplier_source_id, display_name)
select org_b, (select id from public.supplier_sources where adapter_key = 'manual'), 'Fornecedor B' from ids;
select tests.login('alice@a.test');
select throws_ok(
  $$ insert into public.supplier_offers (organization_id, supplier_connection_id, catalog_product_id, sku, supplier_cost, source)
     select org_b,
            (select id from public.supplier_connections where display_name = 'Fornecedor B'),
            (select id from public.catalog_products where normalized_title = 'produto a'),
            'SKU-X', 10, 'manual'
     from ids $$,
  '23503', null, 'oferta não pode referenciar produto de outra organização');
select throws_ok(
  $$ insert into public.supplier_offers (organization_id, supplier_connection_id, catalog_product_id, sku, supplier_cost, source)
     select org_a,
            (select id from public.supplier_connections where display_name = 'Fornecedor B'),
            (select id from public.catalog_products where normalized_title = 'produto a'),
            'SKU-Y', 10, 'manual'
     from ids $$,
  '23503', null, 'oferta não pode usar conexão de fornecedor de outra organização');
select lives_ok(
  $$ insert into public.supplier_offers (organization_id, supplier_connection_id, catalog_product_id, sku, supplier_cost, source, supplier_source_id)
     select org_a,
            (select id from public.supplier_connections where display_name = 'Fornecedor A'),
            (select id from public.catalog_products where normalized_title = 'produto a'),
            'SKU-A', 10, 'manual', (select id from public.supplier_sources where adapter_key = 'generic_rest')
     from ids $$,
  'oferta válida dentro da mesma organização');
select is((select s.adapter_key from public.supplier_offers o join public.supplier_sources s on s.id = o.supplier_source_id where o.sku = 'SKU-A'),
  'manual', 'origem da oferta é derivada da conexão, ignorando o valor do cliente');
select tests.logout();

-- Dados privados e anônimos --------------------------------------------------
select tests.login('alice@a.test');
select throws_ok($$ select * from private.marketplace_credentials $$, '42501', null, 'credenciais inacessíveis ao usuário');
select throws_ok($$ select * from private.oauth_states $$, '42501', null, 'estado OAuth inacessível ao usuário');
select throws_ok($$ select * from public.admin_audit_logs $$, '42501', null, 'auditoria administrativa inacessível');
select throws_ok($$ select public.claim_sync_jobs('x') $$, '42501', null, 'usuário não reserva tarefas da fila');
select tests.logout();

set local role anon;
select throws_ok($$ select * from public.organizations $$, '42501', null, 'anon não lê organizações');
select throws_ok($$ select public.create_organization('X', 'xx-anon') $$, '42501', null, 'anon não cria organização');
reset role;

select * from finish();
rollback;
