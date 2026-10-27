-- Planos, assinaturas, histórico e limites de uso aplicados no banco.

create type public.subscription_status as enum ('trialing', 'active', 'past_due', 'canceled', 'incomplete', 'paused');

-- Configurações da instância. "environment" deve ser 'production' no ambiente de produção:
-- nesse caso assinaturas do provedor 'development' são ignoradas no cálculo de limites.
create table private.app_settings (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);
insert into private.app_settings (key, value) values ('environment', 'development');
revoke all on private.app_settings from public, anon, authenticated;

create table public.plans (
  code text primary key check (code ~ '^[a-z0-9_]{2,40}$'),
  name text not null,
  description text,
  -- Preço em centavos de BRL. NULL = ainda não definido comercialmente.
  monthly_price_cents integer check (monthly_price_cents is null or monthly_price_cents >= 0),
  -- Limites: chave -> número máximo; ausência da chave ou null = ilimitado.
  limits jsonb not null default '{}'::jsonb,
  features jsonb not null default '[]'::jsonb,
  is_public boolean not null default false,
  is_default boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index plans_single_default on public.plans (is_default) where is_default;
create trigger plans_updated_at before update on public.plans
  for each row execute function private.set_updated_at();

create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  provider text not null check (provider in ('internal', 'development', 'stripe', 'asaas', 'mercadopago', 'pagarme')),
  external_subscription_id text,
  plan_code text not null references public.plans(code),
  status public.subscription_status not null,
  current_period_start timestamptz,
  current_period_end timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (provider, external_subscription_id)
);
create index subscriptions_org_idx on public.subscriptions (organization_id, created_at desc);
create trigger subscriptions_updated_at before update on public.subscriptions
  for each row execute function private.set_updated_at();
create trigger subscriptions_org_immutable before update on public.subscriptions
  for each row execute function private.prevent_organization_change();

create table public.subscription_events (
  id bigint generated always as identity primary key,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  subscription_id uuid not null,
  provider text not null,
  event_type text not null,
  external_event_id text,
  old_status public.subscription_status,
  new_status public.subscription_status,
  old_plan_code text,
  new_plan_code text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  foreign key (organization_id, subscription_id) references public.subscriptions(organization_id, id) on delete cascade,
  unique (provider, external_event_id)
);
create index subscription_events_org_idx on public.subscription_events (organization_id, created_at desc);

create table public.usage_records (
  id bigint generated always as identity primary key,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  metric text not null,
  quantity bigint not null check (quantity >= 0),
  period_start timestamptz not null,
  period_end timestamptz not null check (period_end > period_start),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (organization_id, metric, period_start)
);

-- Histórico automático de mudanças de assinatura.
create or replace function private.log_subscription_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' or new.status is distinct from old.status or new.plan_code is distinct from old.plan_code then
    insert into public.subscription_events (
      organization_id, subscription_id, provider, event_type, old_status, new_status, old_plan_code, new_plan_code
    ) values (
      new.organization_id, new.id, new.provider,
      case when tg_op = 'INSERT' then 'subscription.created' else 'subscription.updated' end,
      case when tg_op = 'UPDATE' then old.status end, new.status,
      case when tg_op = 'UPDATE' then old.plan_code end, new.plan_code
    );
  end if;
  return null;
end;
$$;
create trigger subscriptions_history after insert or update on public.subscriptions
  for each row execute function private.log_subscription_change();

-- Plano efetivo: assinatura ativa/trial mais recente dentro do período; senão o plano padrão.
create or replace function private.effective_plan_code(org uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (
      select s.plan_code
      from public.subscriptions s
      where s.organization_id = org
        and s.status in ('active', 'trialing')
        and (s.current_period_end is null or s.current_period_end > now())
        and not (
          s.provider = 'development'
          and coalesce((select value from private.app_settings where key = 'environment'), 'development') = 'production'
        )
      -- Assinatura de provedor externo prevalece sobre a interna padrão.
      order by (s.provider <> 'internal') desc, s.created_at desc
      limit 1
    ),
    (select code from public.plans where is_default limit 1)
  );
$$;

create or replace function private.plan_limit(org uuid, limit_key text)
returns bigint
language sql
stable
security definer
set search_path = ''
as $$
  select (p.limits ->> limit_key)::bigint
  from public.plans p
  where p.code = private.effective_plan_code(org);
$$;

-- Trigger genérico de limite. TG_ARGV[0] = chave do limite; TG_ARGV[1] (opcional) = filtro SQL adicional.
create or replace function private.enforce_plan_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  max_allowed bigint;
  current_count bigint;
  extra_filter text := coalesce(tg_argv[1], 'true');
begin
  max_allowed := private.plan_limit(new.organization_id, tg_argv[0]);
  if max_allowed is null then
    return new;
  end if;

  -- Serializa inserções concorrentes da mesma organização para o mesmo limite.
  perform pg_advisory_xact_lock(hashtext(new.organization_id::text || ':' || tg_argv[0]));

  execute format(
    'select count(*) from %I.%I where organization_id = $1 and (%s)',
    tg_table_schema, tg_table_name, extra_filter
  ) into current_count using new.organization_id;

  if current_count >= max_allowed then
    raise exception 'Limite do plano atingido para %: % de %', tg_argv[0], current_count, max_allowed
      using errcode = 'P0001', hint = 'plan_limit:' || tg_argv[0];
  end if;
  return new;
end;
$$;

create trigger organization_members_plan_limit before insert on public.organization_members
  for each row execute function private.enforce_plan_limit('max_members');

-- Toda organização nasce com assinatura interna no plano padrão (sem cobrança).
create or replace function private.create_default_subscription()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  default_plan text;
begin
  select code into default_plan from public.plans where is_default limit 1;
  if default_plan is not null then
    insert into public.subscriptions (organization_id, provider, plan_code, status, current_period_start)
    values (new.id, 'internal', default_plan, 'active', now());
  end if;
  return new;
end;
$$;
create trigger organizations_default_subscription after insert on public.organizations
  for each row execute function private.create_default_subscription();

-- Resumo de uso para a tela de plano (RLS aplicada pelo chamador nas contagens).
create or replace function public.organization_plan(org uuid)
returns table (plan_code text, plan_name text, limits jsonb, features jsonb)
language sql
stable
security invoker
set search_path = ''
as $$
  select p.code, p.name, p.limits, p.features
  from public.plans p
  where private.has_org_role(org, 'viewer')
    and p.code = private.effective_plan_code(org);
$$;
grant execute on function private.effective_plan_code(uuid) to authenticated, service_role;
grant execute on function private.plan_limit(uuid, text) to authenticated, service_role;
revoke all on function public.organization_plan(uuid) from public, anon;
grant execute on function public.organization_plan(uuid) to authenticated;

-- RLS
alter table public.plans enable row level security;
alter table public.subscriptions enable row level security;
alter table public.subscription_events enable row level security;
alter table public.usage_records enable row level security;

revoke all on public.plans, public.subscriptions, public.subscription_events, public.usage_records from anon, authenticated;

grant select on public.plans to authenticated;
create policy plans_select on public.plans for select to authenticated
  using (is_public or is_default or code in (
    select s.plan_code from public.subscriptions s
    where s.organization_id in (select private.org_ids_with_role('viewer'))
  ));

grant select on public.subscriptions to authenticated;
create policy subscriptions_select on public.subscriptions for select to authenticated
  using (organization_id in (select private.org_ids_with_role('viewer')));

grant select on public.subscription_events to authenticated;
create policy subscription_events_select on public.subscription_events for select to authenticated
  using (organization_id in (select private.org_ids_with_role('admin')));

grant select on public.usage_records to authenticated;
create policy usage_records_select on public.usage_records for select to authenticated
  using (organization_id in (select private.org_ids_with_role('viewer')));

-- Planos iniciais. Limites e preços são configuráveis e NÃO representam decisão comercial definitiva
-- (preço NULL = a definir). Ver docs/billing.md.
insert into public.plans (code, name, description, monthly_price_cents, limits, features, is_public, is_default, sort_order) values
  ('free', 'Gratuito', 'Plano inicial para avaliação, sem cobrança.', 0,
   '{"max_members": 2, "max_products": 50, "max_supplier_offers": 100, "max_marketplace_accounts": 1, "max_active_listings": 20, "max_imports_per_month": 5}',
   '["catalog", "pricing", "marketplace"]', true, true, 10),
  ('pro', 'Profissional', 'Limites ampliados. Preço a definir.', null,
   '{"max_members": 5, "max_products": 2000, "max_supplier_offers": 5000, "max_marketplace_accounts": 3, "max_active_listings": 1000, "max_imports_per_month": 100}',
   '["catalog", "pricing", "marketplace", "competitors", "orders"]', true, false, 20),
  ('business', 'Empresarial', 'Limites altos para operações maiores. Preço a definir.', null,
   '{"max_members": 25, "max_products": 50000, "max_supplier_offers": 100000, "max_marketplace_accounts": 10, "max_active_listings": 20000, "max_imports_per_month": 1000}',
   '["catalog", "pricing", "marketplace", "competitors", "orders", "supplier_api"]', true, false, 30);
