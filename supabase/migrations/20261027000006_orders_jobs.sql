-- Pedidos do marketplace, pedidos de compra ao fornecedor, envios, webhooks, fila durável e erros de integração.

create type public.fulfillment_status as enum
  ('pending', 'awaiting_supplier', 'forwarded', 'shipped', 'delivered', 'problem', 'canceled');
create type public.purchase_order_status as enum
  ('draft', 'submitted', 'accepted', 'rejected', 'shipped', 'delivered', 'canceled', 'failed');
create type public.job_status as enum ('pending', 'running', 'succeeded', 'failed', 'dead');

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  marketplace_account_id uuid not null,
  external_order_id text not null,
  external_pack_id text,
  external_shipment_id text,
  status text not null,
  fulfillment_status public.fulfillment_status not null default 'pending',
  total_amount numeric(14, 2) not null,
  currency char(3) not null default 'BRL',
  buyer_nickname text,
  ordered_at timestamptz,
  last_synced_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  -- Deduplicação: o mesmo pedido externo nunca gera dois registros.
  unique (marketplace_account_id, external_order_id),
  foreign key (organization_id, marketplace_account_id)
    references public.marketplace_accounts(organization_id, id) on delete cascade
);
create index orders_org_idx on public.orders (organization_id, ordered_at desc nulls last);
create trigger orders_updated_at before update on public.orders
  for each row execute function private.set_updated_at();
create trigger orders_version before update on public.orders
  for each row execute function private.bump_version();
create trigger orders_org_immutable before update on public.orders
  for each row execute function private.prevent_organization_change();

create table public.order_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  order_id uuid not null,
  marketplace_listing_id uuid,
  supplier_offer_id uuid,
  external_item_id text not null,
  external_variation_id text not null default '',
  sku text,
  title text,
  quantity integer not null check (quantity > 0),
  unit_price numeric(14, 2) not null,
  item_total numeric(14, 2) not null,
  sale_fee numeric(14, 2),
  metadata jsonb not null default '{}'::jsonb,
  unique (organization_id, id),
  unique (order_id, external_item_id, external_variation_id),
  foreign key (organization_id, order_id) references public.orders(organization_id, id) on delete cascade,
  foreign key (organization_id, marketplace_listing_id)
    references public.marketplace_listings(organization_id, id) on delete set null (marketplace_listing_id),
  foreign key (organization_id, supplier_offer_id)
    references public.supplier_offers(organization_id, id) on delete set null (supplier_offer_id)
);

create table public.supplier_purchase_orders (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  supplier_connection_id uuid not null,
  order_id uuid not null,
  external_purchase_order_id text,
  submission_method text not null default 'manual' check (submission_method in ('manual', 'api')),
  status public.purchase_order_status not null default 'draft',
  total_cost numeric(14, 2) check (total_cost is null or total_cost >= 0),
  notes text check (notes is null or char_length(notes) <= 2000),
  idempotency_key uuid not null default gen_random_uuid() unique,
  submitted_at timestamptz,
  submitted_by uuid references auth.users(id) on delete set null,
  accepted_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  foreign key (organization_id, supplier_connection_id)
    references public.supplier_connections(organization_id, id) on delete restrict,
  foreign key (organization_id, order_id) references public.orders(organization_id, id) on delete cascade
);
-- No máximo um pedido de compra "vivo" por pedido e fornecedor.
create unique index supplier_purchase_orders_active_idx on public.supplier_purchase_orders (order_id, supplier_connection_id)
  where status not in ('canceled', 'rejected', 'failed');
create trigger supplier_purchase_orders_updated_at before update on public.supplier_purchase_orders
  for each row execute function private.set_updated_at();
create trigger supplier_purchase_orders_version before update on public.supplier_purchase_orders
  for each row execute function private.bump_version();
create trigger supplier_purchase_orders_org_immutable before update on public.supplier_purchase_orders
  for each row execute function private.prevent_organization_change();

-- Máquina de estados do pedido de compra, aplicada no banco.
create or replace function private.purchase_order_transition()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  allowed boolean;
begin
  if new.status = old.status then
    return new;
  end if;
  allowed := case old.status
    when 'draft' then new.status in ('submitted', 'canceled', 'failed')
    when 'submitted' then new.status in ('accepted', 'rejected', 'canceled', 'failed')
    when 'accepted' then new.status in ('shipped', 'canceled')
    when 'shipped' then new.status in ('delivered')
    when 'failed' then new.status in ('draft')
    else false
  end;
  if not allowed then
    raise exception 'transição de status inválida: % -> %', old.status, new.status using errcode = 'P0001';
  end if;
  if new.status = 'submitted' then
    new.submitted_at := coalesce(new.submitted_at, now());
    new.submitted_by := coalesce(new.submitted_by, (select auth.uid()));
  elsif new.status = 'accepted' then
    new.accepted_at := coalesce(new.accepted_at, now());
  end if;
  return new;
end;
$$;
create trigger supplier_purchase_orders_transition before update on public.supplier_purchase_orders
  for each row execute function private.purchase_order_transition();

create table public.shipments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  supplier_purchase_order_id uuid not null,
  carrier text check (carrier is null or char_length(carrier) <= 80),
  tracking_code text check (tracking_code is null or char_length(tracking_code) <= 80),
  tracking_url text check (tracking_url is null or tracking_url ~ '^https://'),
  status text not null default 'pending' check (status in ('pending', 'dispatched', 'in_transit', 'delivered', 'returned', 'lost')),
  dispatched_at timestamptz,
  delivered_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (organization_id, supplier_purchase_order_id)
    references public.supplier_purchase_orders(organization_id, id) on delete cascade
);
create trigger shipments_updated_at before update on public.shipments
  for each row execute function private.set_updated_at();
create trigger shipments_org_immutable before update on public.shipments
  for each row execute function private.prevent_organization_change();

-- Notificações recebidas. A organização é resolvida no processamento (consulta à conta conectada).
create table public.webhook_events (
  id uuid primary key default gen_random_uuid(),
  marketplace text not null,
  event_key text not null unique,
  resource text not null,
  topic text not null,
  external_user_id text,
  application_id text,
  organization_id uuid references public.organizations(id) on delete set null,
  marketplace_account_id uuid references public.marketplace_accounts(id) on delete set null,
  status text not null default 'received' check (status in ('received', 'queued', 'processed', 'ignored', 'failed')),
  attempts integer not null default 0,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  last_error text,
  metadata jsonb not null default '{}'::jsonb
);
create index webhook_events_org_idx on public.webhook_events (organization_id, received_at desc);
create index webhook_events_status_idx on public.webhook_events (status, received_at);

create table public.sync_jobs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete cascade,
  job_type text not null check (job_type ~ '^[a-z0-9_.]{3,60}$'),
  deduplication_key text,
  status public.job_status not null default 'pending',
  priority smallint not null default 100,
  attempts integer not null default 0,
  max_attempts integer not null default 8 check (max_attempts between 1 and 50),
  available_at timestamptz not null default now(),
  locked_at timestamptz,
  locked_by text,
  started_at timestamptz,
  finished_at timestamptz,
  duration_ms integer,
  payload jsonb not null default '{}'::jsonb,
  result jsonb,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- Deduplicação: no máximo uma tarefa pendente/em execução por chave.
create unique index sync_jobs_dedup_idx on public.sync_jobs (deduplication_key)
  where deduplication_key is not null and status in ('pending', 'running');
create index sync_jobs_claim_idx on public.sync_jobs (status, priority, available_at);
create index sync_jobs_org_idx on public.sync_jobs (organization_id, created_at desc);
create trigger sync_jobs_updated_at before update on public.sync_jobs
  for each row execute function private.set_updated_at();

create table public.integration_errors (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete cascade,
  integration_type text not null,
  entity_type text,
  entity_id text,
  error_code text,
  message text not null,
  retryable boolean not null default false,
  context jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid references auth.users(id) on delete set null
);
create index integration_errors_org_idx on public.integration_errors (organization_id, occurred_at desc);

-- ---------------------------------------------------------------------------
-- Fila: funções executadas somente pelo servidor (service role).
-- ---------------------------------------------------------------------------
create or replace function public.enqueue_sync_job(
  p_organization_id uuid,
  p_job_type text,
  p_payload jsonb default '{}'::jsonb,
  p_deduplication_key text default null,
  p_available_at timestamptz default now(),
  p_priority smallint default 100,
  p_max_attempts integer default 8
)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  job_id uuid;
begin
  insert into public.sync_jobs (organization_id, job_type, payload, deduplication_key, available_at, priority, max_attempts)
  values (p_organization_id, p_job_type, coalesce(p_payload, '{}'::jsonb), p_deduplication_key, p_available_at, p_priority, p_max_attempts)
  on conflict (deduplication_key) where deduplication_key is not null and status in ('pending', 'running')
  do nothing
  returning id into job_id;

  if job_id is null then
    select id into job_id from public.sync_jobs
    where deduplication_key = p_deduplication_key and status in ('pending', 'running')
    limit 1;
  end if;
  return job_id;
end;
$$;

-- Reserva tarefas disponíveis e recupera tarefas abandonadas (lease expirado).
create or replace function public.claim_sync_jobs(p_worker text, p_batch integer default 10, p_lease_seconds integer default 300)
returns setof public.sync_jobs
language plpgsql
set search_path = ''
as $$
begin
  -- Tarefas abandonadas que já esgotaram as tentativas são encerradas.
  update public.sync_jobs
  set status = 'dead', finished_at = now(), locked_at = null,
      last_error = coalesce(last_error, 'lease expirado sem conclusão')
  where status = 'running'
    and locked_at < now() - make_interval(secs => p_lease_seconds)
    and attempts >= max_attempts;

  return query
  with candidates as (
    select j.id
    from public.sync_jobs j
    where (j.status = 'pending' and j.available_at <= now())
       or (j.status = 'running' and j.locked_at < now() - make_interval(secs => p_lease_seconds))
    order by j.priority, j.available_at
    limit greatest(1, least(p_batch, 100))
    for update skip locked
  )
  update public.sync_jobs j
  set status = 'running',
      attempts = j.attempts + 1,
      locked_at = now(),
      locked_by = p_worker,
      started_at = now()
  from candidates c
  where j.id = c.id
  returning j.*;
end;
$$;

create or replace function public.complete_sync_job(p_job_id uuid, p_worker text, p_result jsonb default null)
returns boolean
language plpgsql
set search_path = ''
as $$
begin
  update public.sync_jobs
  set status = 'succeeded', result = p_result, finished_at = now(), locked_at = null,
      duration_ms = (extract(epoch from (now() - started_at)) * 1000)::integer, last_error = null
  where id = p_job_id and status = 'running' and locked_by = p_worker;
  return found;
end;
$$;

-- Falha: reagenda com backoff se for temporária e houver tentativas; senão marca como "dead".
create or replace function public.fail_sync_job(
  p_job_id uuid, p_worker text, p_error text, p_retryable boolean, p_backoff_seconds integer default 60
)
returns public.job_status
language plpgsql
set search_path = ''
as $$
declare
  new_status public.job_status;
begin
  update public.sync_jobs
  set status = case when p_retryable and attempts < max_attempts then 'pending'::public.job_status else 'dead'::public.job_status end,
      available_at = now() + make_interval(secs => greatest(1, p_backoff_seconds)),
      last_error = left(p_error, 2000),
      locked_at = null,
      finished_at = case when p_retryable and attempts < max_attempts then null else now() end,
      duration_ms = (extract(epoch from (now() - started_at)) * 1000)::integer
  where id = p_job_id and status = 'running' and locked_by = p_worker
  returning status into new_status;
  return new_status;
end;
$$;

-- Reprocessamento manual seguro de uma tarefa encerrada.
create or replace function public.retry_sync_job(p_job_id uuid)
returns boolean
language plpgsql
set search_path = ''
as $$
begin
  update public.sync_jobs
  set status = 'pending', available_at = now(), attempts = 0, last_error = null, finished_at = null, locked_by = null
  where id = p_job_id and status in ('dead', 'failed');
  return found;
end;
$$;

revoke all on function public.enqueue_sync_job(uuid, text, jsonb, text, timestamptz, smallint, integer) from public, anon, authenticated;
revoke all on function public.claim_sync_jobs(text, integer, integer) from public, anon, authenticated;
revoke all on function public.complete_sync_job(uuid, text, jsonb) from public, anon, authenticated;
revoke all on function public.fail_sync_job(uuid, text, text, boolean, integer) from public, anon, authenticated;
revoke all on function public.retry_sync_job(uuid) from public, anon, authenticated;
grant execute on function public.enqueue_sync_job(uuid, text, jsonb, text, timestamptz, smallint, integer) to service_role;
grant execute on function public.claim_sync_jobs(text, integer, integer) to service_role;
grant execute on function public.complete_sync_job(uuid, text, jsonb) to service_role;
grant execute on function public.fail_sync_job(uuid, text, text, boolean, integer) to service_role;
grant execute on function public.retry_sync_job(uuid) to service_role;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.supplier_purchase_orders enable row level security;
alter table public.shipments enable row level security;
alter table public.webhook_events enable row level security;
alter table public.sync_jobs enable row level security;
alter table public.integration_errors enable row level security;

revoke all on public.orders, public.order_items, public.supplier_purchase_orders, public.shipments,
  public.webhook_events, public.sync_jobs, public.integration_errors from anon, authenticated;

-- Pedidos espelham o marketplace: leitura para membros, escrita pelo servidor.
grant select on public.orders to authenticated;
grant update (fulfillment_status) on public.orders to authenticated;
create policy orders_select on public.orders for select to authenticated
  using (organization_id in (select private.org_ids_with_role('viewer')));
create policy orders_update on public.orders for update to authenticated
  using (organization_id in (select private.org_ids_with_role('operator')))
  with check (organization_id in (select private.org_ids_with_role('operator')));

grant select on public.order_items to authenticated;
create policy order_items_select on public.order_items for select to authenticated
  using (organization_id in (select private.org_ids_with_role('viewer')));

-- Encaminhamento manual ao fornecedor: operadores criam e atualizam.
grant select on public.supplier_purchase_orders to authenticated;
grant insert (organization_id, supplier_connection_id, order_id, submission_method, total_cost, notes, metadata)
  on public.supplier_purchase_orders to authenticated;
grant update (status, external_purchase_order_id, total_cost, notes)
  on public.supplier_purchase_orders to authenticated;
create policy purchase_orders_select on public.supplier_purchase_orders for select to authenticated
  using (organization_id in (select private.org_ids_with_role('viewer')));
create policy purchase_orders_insert on public.supplier_purchase_orders for insert to authenticated
  with check (organization_id in (select private.org_ids_with_role('operator')) and submission_method = 'manual');
create policy purchase_orders_update on public.supplier_purchase_orders for update to authenticated
  using (organization_id in (select private.org_ids_with_role('operator')))
  with check (organization_id in (select private.org_ids_with_role('operator')));

grant select on public.shipments to authenticated;
grant insert (organization_id, supplier_purchase_order_id, carrier, tracking_code, tracking_url, status, dispatched_at, delivered_at)
  on public.shipments to authenticated;
grant update (carrier, tracking_code, tracking_url, status, dispatched_at, delivered_at)
  on public.shipments to authenticated;
create policy shipments_select on public.shipments for select to authenticated
  using (organization_id in (select private.org_ids_with_role('viewer')));
create policy shipments_insert on public.shipments for insert to authenticated
  with check (organization_id in (select private.org_ids_with_role('operator')));
create policy shipments_update on public.shipments for update to authenticated
  using (organization_id in (select private.org_ids_with_role('operator')))
  with check (organization_id in (select private.org_ids_with_role('operator')));

grant select (id, marketplace, resource, topic, organization_id, marketplace_account_id, status, attempts,
  received_at, processed_at, last_error)
  on public.webhook_events to authenticated;
create policy webhook_events_select on public.webhook_events for select to authenticated
  using (organization_id in (select private.org_ids_with_role('admin')));

grant select (id, organization_id, job_type, status, attempts, max_attempts, available_at, started_at, finished_at,
  duration_ms, last_error, created_at)
  on public.sync_jobs to authenticated;
create policy sync_jobs_select on public.sync_jobs for select to authenticated
  using (organization_id in (select private.org_ids_with_role('viewer')));

grant select on public.integration_errors to authenticated;
grant update (resolved_at, resolved_by) on public.integration_errors to authenticated;
create policy integration_errors_select on public.integration_errors for select to authenticated
  using (organization_id in (select private.org_ids_with_role('viewer')));
create policy integration_errors_update on public.integration_errors for update to authenticated
  using (organization_id in (select private.org_ids_with_role('operator')))
  with check (organization_id in (select private.org_ids_with_role('operator')) and resolved_by = (select auth.uid()));
