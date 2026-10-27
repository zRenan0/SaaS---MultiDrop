-- Fundação multi-tenant: organizações, membros, perfis, convites, administradores da plataforma e auditoria.
-- Convenções:
--   * Toda tabela de tenant tem organization_id NOT NULL e UNIQUE (organization_id, id) para permitir
--     chaves estrangeiras compostas, impedindo referências cruzadas entre empresas.
--   * Funções auxiliares de autorização ficam no schema "private", que não é exposto pela API REST.
--   * Privilégios de tabela são concedidos explicitamente (defesa em profundidade junto com RLS).

create extension if not exists pgcrypto with schema extensions;

create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Tipos
-- ---------------------------------------------------------------------------
create type public.member_role as enum ('owner', 'admin', 'operator', 'viewer');
create type public.organization_status as enum ('active', 'suspended', 'deleted');

-- ---------------------------------------------------------------------------
-- Utilitários genéricos
-- ---------------------------------------------------------------------------
create or replace function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- Impede mover um registro de uma organização para outra (vale também para o service role).
create or replace function private.prevent_organization_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.organization_id is distinct from old.organization_id then
    raise exception 'organization_id não pode ser alterado' using errcode = '42501';
  end if;
  return new;
end;
$$;

create or replace function private.role_rank(r public.member_role)
returns integer
language sql
immutable
set search_path = ''
as $$
  select case r
    when 'owner' then 4
    when 'admin' then 3
    when 'operator' then 2
    when 'viewer' then 1
  end;
$$;

-- ---------------------------------------------------------------------------
-- Organizações
-- ---------------------------------------------------------------------------
create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 120),
  slug text not null unique check (slug ~ '^[a-z0-9](?:[a-z0-9-]{1,46}[a-z0-9])$'),
  status public.organization_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger organizations_updated_at before update on public.organizations
  for each row execute function private.set_updated_at();

create table public.organization_members (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.member_role not null,
  created_at timestamptz not null default now(),
  unique (organization_id, user_id),
  unique (organization_id, id)
);
create index organization_members_user_idx on public.organization_members (user_id, organization_id);

create trigger organization_members_org_immutable before update on public.organization_members
  for each row execute function private.prevent_organization_change();

-- ---------------------------------------------------------------------------
-- Funções de autorização
-- SECURITY DEFINER é necessário porque as políticas de organization_members precisariam consultar
-- a própria tabela (recursão de RLS). As funções respondem somente sobre auth.uid() e não aceitam
-- um user_id arbitrário, portanto não permitem enumerar associações de outros usuários.
-- ---------------------------------------------------------------------------
create or replace function private.org_ids_with_role(min_role public.member_role)
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select m.organization_id
  from public.organization_members m
  join public.organizations o on o.id = m.organization_id
  where m.user_id = (select auth.uid())
    and o.status = 'active'
    and private.role_rank(m.role) >= private.role_rank(min_role);
$$;

create or replace function private.has_org_role(org uuid, min_role public.member_role)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from private.org_ids_with_role(min_role) as ids(id) where ids.id = org
  );
$$;

revoke all on function private.org_ids_with_role(public.member_role) from public;
revoke all on function private.has_org_role(uuid, public.member_role) from public;
grant execute on function private.org_ids_with_role(public.member_role) to authenticated, service_role;
grant execute on function private.has_org_role(uuid, public.member_role) to authenticated, service_role;
grant execute on function private.role_rank(public.member_role) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Perfis (espelho mínimo de auth.users para exibir e-mail/nome entre membros)
-- ---------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  full_name text check (full_name is null or char_length(full_name) <= 120),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger profiles_updated_at before update on public.profiles
  for each row execute function private.set_updated_at();

-- Trigger em auth.users: precisa de SECURITY DEFINER para escrever em public.profiles.
create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, coalesce(new.email, ''), nullif(new.raw_user_meta_data ->> 'full_name', ''))
  on conflict (id) do update set email = excluded.email;
  return new;
end;
$$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function private.handle_new_user();

create or replace function private.handle_user_email_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.email is distinct from old.email then
    update public.profiles set email = coalesce(new.email, '') where id = new.id;
  end if;
  return new;
end;
$$;

create trigger on_auth_user_email_changed after update of email on auth.users
  for each row execute function private.handle_user_email_change();

-- ---------------------------------------------------------------------------
-- Convites
-- ---------------------------------------------------------------------------
create table public.organization_invitations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  email text not null check (email = lower(email) and position('@' in email) > 1),
  role public.member_role not null check (role <> 'owner'),
  token_hash text not null unique,
  invited_by uuid references auth.users(id) on delete set null,
  expires_at timestamptz not null,
  accepted_at timestamptz,
  accepted_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (organization_id, id)
);
create unique index organization_invitations_pending_idx
  on public.organization_invitations (organization_id, email) where accepted_at is null;

create trigger organization_invitations_org_immutable before update on public.organization_invitations
  for each row execute function private.prevent_organization_change();

-- ---------------------------------------------------------------------------
-- Administradores da plataforma (operador do SaaS). Gerenciado apenas por SQL/service role.
-- ---------------------------------------------------------------------------
create table public.platform_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create or replace function private.is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.platform_admins where user_id = (select auth.uid()));
$$;
revoke all on function private.is_platform_admin() from public;
grant execute on function private.is_platform_admin() to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Auditoria
-- ---------------------------------------------------------------------------
create table public.audit_logs (
  id bigint generated always as identity primary key,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  actor_user_id uuid references auth.users(id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id text,
  request_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index audit_logs_org_created_idx on public.audit_logs (organization_id, created_at desc);

create table public.admin_audit_logs (
  id bigint generated always as identity primary key,
  actor_user_id uuid references auth.users(id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- Auditoria automática das mudanças de associação (papel, entrada, saída).
create or replace function private.audit_membership_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  rec public.organization_members;
begin
  rec := coalesce(new, old);
  -- Exclusão em cascata da própria organização: não há onde registrar.
  if not exists (select 1 from public.organizations where id = rec.organization_id) then
    return null;
  end if;
  insert into public.audit_logs (organization_id, actor_user_id, action, entity_type, entity_id, metadata)
  values (
    rec.organization_id,
    (select auth.uid()),
    'member.' || lower(tg_op),
    'organization_member',
    rec.id::text,
    jsonb_build_object(
      'user_id', rec.user_id,
      'old_role', case when tg_op <> 'INSERT' then old.role end,
      'new_role', case when tg_op <> 'DELETE' then new.role end
    )
  );
  return null;
end;
$$;

create trigger organization_members_audit after insert or update or delete on public.organization_members
  for each row execute function private.audit_membership_change();

-- ---------------------------------------------------------------------------
-- RPCs
-- ---------------------------------------------------------------------------

-- Cria organização e associa o chamador como owner, de forma atômica.
-- SECURITY DEFINER: o chamador ainda não é membro, então as políticas de insert em
-- organization_members não permitiriam a inserção do primeiro owner.
create or replace function public.create_organization(org_name text, org_slug text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  new_org uuid;
  owned_count integer;
begin
  if uid is null then
    raise exception 'não autenticado' using errcode = '42501';
  end if;

  select count(*) into owned_count
  from public.organization_members
  where user_id = uid and role = 'owner';
  if owned_count >= 10 then
    raise exception 'limite de organizações por usuário atingido' using errcode = 'P0001';
  end if;

  insert into public.organizations (name, slug) values (trim(org_name), lower(trim(org_slug)))
  returning id into new_org;

  insert into public.organization_members (organization_id, user_id, role)
  values (new_org, uid, 'owner');

  return new_org;
end;
$$;
revoke all on function public.create_organization(text, text) from public, anon;
grant execute on function public.create_organization(text, text) to authenticated;

-- Aceita um convite. O e-mail é lido do JWT emitido pelo Supabase Auth (não de user_metadata).
create or replace function public.accept_invitation(invite_token text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  user_email text := lower(coalesce((select auth.jwt()) ->> 'email', ''));
  inv public.organization_invitations;
begin
  if uid is null then
    raise exception 'não autenticado' using errcode = '42501';
  end if;

  select * into inv
  from public.organization_invitations
  where token_hash = encode(extensions.digest(invite_token, 'sha256'), 'hex')
  for update;

  if inv.id is null or inv.accepted_at is not null or inv.expires_at < now() then
    raise exception 'convite inválido ou expirado' using errcode = 'P0001';
  end if;
  if inv.email <> user_email then
    raise exception 'convite emitido para outro e-mail' using errcode = '42501';
  end if;

  insert into public.organization_members (organization_id, user_id, role)
  values (inv.organization_id, uid, inv.role)
  on conflict (organization_id, user_id) do nothing;

  update public.organization_invitations
  set accepted_at = now(), accepted_by = uid
  where id = inv.id;

  return inv.organization_id;
end;
$$;
revoke all on function public.accept_invitation(text) from public, anon;
grant execute on function public.accept_invitation(text) to authenticated;

-- ---------------------------------------------------------------------------
-- RLS e privilégios
-- ---------------------------------------------------------------------------
alter table public.organizations enable row level security;
alter table public.organization_members enable row level security;
alter table public.profiles enable row level security;
alter table public.organization_invitations enable row level security;
alter table public.platform_admins enable row level security;
alter table public.audit_logs enable row level security;
alter table public.admin_audit_logs enable row level security;

revoke all on public.organizations, public.organization_members, public.profiles,
  public.organization_invitations, public.platform_admins, public.audit_logs,
  public.admin_audit_logs from anon, authenticated;

-- organizations
grant select on public.organizations to authenticated;
grant update (name) on public.organizations to authenticated;

create policy organizations_select on public.organizations for select to authenticated
  using (id in (select private.org_ids_with_role('viewer')));
create policy organizations_update on public.organizations for update to authenticated
  using (id in (select private.org_ids_with_role('admin')))
  with check (id in (select private.org_ids_with_role('admin')));

-- organization_members
grant select, delete on public.organization_members to authenticated;
grant update (role) on public.organization_members to authenticated;

create policy members_select on public.organization_members for select to authenticated
  using (organization_id in (select private.org_ids_with_role('viewer')));
-- Admins alteram papéis de não-owners e não podem promover alguém a owner.
create policy members_update on public.organization_members for update to authenticated
  using (organization_id in (select private.org_ids_with_role('admin')) and role <> 'owner')
  with check (organization_id in (select private.org_ids_with_role('admin')) and role <> 'owner');
-- Admins removem não-owners; qualquer membro não-owner pode sair.
create policy members_delete on public.organization_members for delete to authenticated
  using (
    role <> 'owner' and (
      organization_id in (select private.org_ids_with_role('admin'))
      or user_id = (select auth.uid())
    )
  );

-- profiles
grant select on public.profiles to authenticated;
grant update (full_name) on public.profiles to authenticated;

create policy profiles_select on public.profiles for select to authenticated
  using (
    id = (select auth.uid())
    or id in (
      select m.user_id from public.organization_members m
      where m.organization_id in (select private.org_ids_with_role('viewer'))
    )
  );
create policy profiles_update on public.profiles for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- organization_invitations (token nunca é legível: só o hash é armazenado)
grant select (id, organization_id, email, role, invited_by, expires_at, accepted_at, accepted_by, created_at)
  on public.organization_invitations to authenticated;
grant insert (organization_id, email, role, token_hash, invited_by, expires_at)
  on public.organization_invitations to authenticated;
grant delete on public.organization_invitations to authenticated;

create policy invitations_select on public.organization_invitations for select to authenticated
  using (organization_id in (select private.org_ids_with_role('admin')));
create policy invitations_insert on public.organization_invitations for insert to authenticated
  with check (
    organization_id in (select private.org_ids_with_role('admin'))
    and invited_by = (select auth.uid())
    and expires_at <= now() + interval '14 days'
  );
create policy invitations_delete on public.organization_invitations for delete to authenticated
  using (organization_id in (select private.org_ids_with_role('admin')) and accepted_at is null);

-- platform_admins: o próprio usuário pode verificar se é admin; nenhuma escrita via API.
grant select on public.platform_admins to authenticated;
create policy platform_admins_select_self on public.platform_admins for select to authenticated
  using (user_id = (select auth.uid()));

-- audit_logs: leitura para admins da organização; escrita apenas por triggers/service role.
grant select on public.audit_logs to authenticated;
create policy audit_logs_select on public.audit_logs for select to authenticated
  using (organization_id in (select private.org_ids_with_role('admin')));

-- admin_audit_logs: sem acesso pela API (somente service role).
