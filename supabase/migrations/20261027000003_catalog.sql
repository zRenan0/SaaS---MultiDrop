-- Fornecedores, catálogo normalizado por organização, ofertas, importações e concorrentes.

create type public.supplier_connection_status as enum ('active', 'pending', 'error', 'disabled');
create type public.offer_status as enum ('active', 'paused', 'out_of_stock', 'discontinued');
create type public.import_status as enum ('previewed', 'importing', 'completed', 'failed', 'canceled');

-- Incrementa a versão em cada atualização (controle otimista de concorrência).
create or replace function private.bump_version()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.version := old.version + 1;
  return new;
end;
$$;

-- Catálogo global de tipos de fornecedor/adaptador. Escrita apenas pelo operador do SaaS.
create table public.supplier_sources (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  adapter_key text not null unique check (adapter_key ~ '^[a-z0-9_]{2,40}$'),
  status text not null check (status in ('available', 'not_configured', 'disabled')),
  capabilities jsonb not null default '[]'::jsonb check (jsonb_typeof(capabilities) = 'array'),
  description text,
  created_at timestamptz not null default now()
);

insert into public.supplier_sources (name, adapter_key, status, capabilities, description) values
  ('Cadastro manual', 'manual', 'available', '["get_offer"]',
   'Produtos e ofertas cadastrados manualmente. Pedidos encaminhados manualmente ao fornecedor.'),
  ('Planilha CSV/Excel', 'file_import', 'available', '["get_offer"]',
   'Produtos e ofertas importados de arquivos CSV ou XLSX enviados pelo usuário.'),
  ('API REST de fornecedor (modelo)', 'generic_rest', 'not_configured', '[]',
   'Estrutura para integrar um fornecedor com API própria. Não configurado: requer contrato, documentação e credenciais do fornecedor.');

create table public.supplier_connections (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  supplier_source_id uuid not null references public.supplier_sources(id),
  display_name text not null check (char_length(display_name) between 2 and 120),
  status public.supplier_connection_status not null default 'active',
  -- Somente dados não secretos (contato, observações, parâmetros públicos). Segredos vão para private.supplier_credentials.
  configuration jsonb not null default '{}'::jsonb check (jsonb_typeof(configuration) = 'object'),
  dropship_agreement_confirmed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, display_name)
);
create trigger supplier_connections_updated_at before update on public.supplier_connections
  for each row execute function private.set_updated_at();
create trigger supplier_connections_org_immutable before update on public.supplier_connections
  for each row execute function private.prevent_organization_change();

create table private.supplier_credentials (
  supplier_connection_id uuid primary key,
  organization_id uuid not null,
  encrypted_secret text not null,
  encryption_key_version integer not null,
  updated_at timestamptz not null default now(),
  foreign key (organization_id, supplier_connection_id)
    references public.supplier_connections(organization_id, id) on delete cascade
);
revoke all on private.supplier_credentials from public, anon, authenticated;

create table public.catalog_products (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  title text not null check (char_length(title) between 3 and 255),
  normalized_title text not null,
  brand text check (brand is null or char_length(brand) <= 120),
  model text check (model is null or char_length(model) <= 120),
  category text check (category is null or char_length(category) <= 200),
  description text check (description is null or char_length(description) <= 50000),
  gtin text check (gtin is null or gtin ~ '^([0-9]{8}|[0-9]{12,14})$'),
  identifiers jsonb not null default '{}'::jsonb check (jsonb_typeof(identifiers) = 'object'),
  attributes jsonb not null default '{}'::jsonb check (jsonb_typeof(attributes) = 'object'),
  -- [{ "url": "https://...", "authorized": true, "source": "fornecedor" }]
  images jsonb not null default '[]'::jsonb check (jsonb_typeof(images) = 'array'),
  is_example boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id)
);
create unique index catalog_products_gtin_idx on public.catalog_products (organization_id, gtin) where gtin is not null;
create index catalog_products_title_idx on public.catalog_products (organization_id, normalized_title);
create trigger catalog_products_updated_at before update on public.catalog_products
  for each row execute function private.set_updated_at();
create trigger catalog_products_org_immutable before update on public.catalog_products
  for each row execute function private.prevent_organization_change();
create trigger catalog_products_plan_limit before insert on public.catalog_products
  for each row execute function private.enforce_plan_limit('max_products');

create table public.supplier_offers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  supplier_source_id uuid not null references public.supplier_sources(id),
  supplier_connection_id uuid not null,
  catalog_product_id uuid not null,
  external_offer_id text,
  sku text not null check (char_length(sku) between 1 and 100),
  supplier_cost numeric(14, 2) not null check (supplier_cost >= 0),
  inbound_shipping_cost numeric(14, 2) not null default 0 check (inbound_shipping_cost >= 0),
  supplier_handling_fee numeric(14, 2) not null default 0 check (supplier_handling_fee >= 0),
  available_stock integer not null default 0 check (available_stock >= 0),
  handling_time_days integer check (handling_time_days is null or handling_time_days between 0 and 90),
  currency char(3) not null default 'BRL' check (currency = 'BRL'),
  source text not null check (source in ('manual', 'file_import', 'api')),
  status public.offer_status not null default 'active',
  cost_updated_at timestamptz not null default now(),
  last_synced_at timestamptz,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, supplier_connection_id, sku),
  foreign key (organization_id, supplier_connection_id)
    references public.supplier_connections(organization_id, id) on delete cascade,
  foreign key (organization_id, catalog_product_id)
    references public.catalog_products(organization_id, id) on delete cascade
);
create index supplier_offers_product_idx on public.supplier_offers (organization_id, catalog_product_id);
create trigger supplier_offers_updated_at before update on public.supplier_offers
  for each row execute function private.set_updated_at();
create trigger supplier_offers_version before update on public.supplier_offers
  for each row execute function private.bump_version();
create trigger supplier_offers_org_immutable before update on public.supplier_offers
  for each row execute function private.prevent_organization_change();
create trigger supplier_offers_plan_limit before insert on public.supplier_offers
  for each row execute function private.enforce_plan_limit('max_supplier_offers');

create table public.catalog_import_runs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  supplier_connection_id uuid not null,
  file_name text not null check (char_length(file_name) <= 255),
  file_type text not null check (file_type in ('csv', 'xlsx')),
  file_sha256 text not null check (file_sha256 ~ '^[0-9a-f]{64}$'),
  status public.import_status not null default 'previewed',
  column_mapping jsonb not null default '{}'::jsonb,
  rows_total integer not null default 0 check (rows_total >= 0),
  rows_processed integer not null default 0 check (rows_processed >= 0),
  rows_imported integer not null default 0 check (rows_imported >= 0),
  rows_updated integer not null default 0 check (rows_updated >= 0),
  rows_rejected integer not null default 0 check (rows_rejected >= 0),
  -- [{ "row": 12, "field": "sku", "message": "..." }] limitado no servidor.
  errors jsonb not null default '[]'::jsonb check (jsonb_typeof(errors) = 'array'),
  created_by uuid references auth.users(id) on delete set null,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  unique (organization_id, id),
  foreign key (organization_id, supplier_connection_id)
    references public.supplier_connections(organization_id, id) on delete cascade
);
create index catalog_import_runs_org_idx on public.catalog_import_runs (organization_id, started_at desc);
create trigger catalog_import_runs_org_immutable before update on public.catalog_import_runs
  for each row execute function private.prevent_organization_change();
create trigger catalog_import_runs_plan_limit before insert on public.catalog_import_runs
  for each row execute function private.enforce_plan_limit('max_imports_per_month', 'started_at >= date_trunc(''month'', now())');

create table public.competitor_snapshots (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  marketplace text not null check (marketplace in ('mercado_livre')),
  external_item_id text not null,
  catalog_product_id uuid,
  title text,
  seller_id text,
  observed_price numeric(14, 2) not null check (observed_price >= 0),
  observed_shipping numeric(14, 2) check (observed_shipping is null or observed_shipping >= 0),
  currency char(3) not null default 'BRL',
  source text not null check (source in ('ml_api', 'manual')),
  source_url text,
  observed_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  foreign key (organization_id, catalog_product_id)
    references public.catalog_products(organization_id, id) on delete cascade
);
create index competitor_snapshots_product_idx on public.competitor_snapshots (organization_id, catalog_product_id, observed_at desc);

-- RLS
alter table public.supplier_sources enable row level security;
alter table public.supplier_connections enable row level security;
alter table public.catalog_products enable row level security;
alter table public.supplier_offers enable row level security;
alter table public.catalog_import_runs enable row level security;
alter table public.competitor_snapshots enable row level security;

revoke all on public.supplier_sources, public.supplier_connections, public.catalog_products,
  public.supplier_offers, public.catalog_import_runs, public.competitor_snapshots from anon, authenticated;

grant select on public.supplier_sources to authenticated;
create policy supplier_sources_select on public.supplier_sources for select to authenticated using (true);

-- supplier_connections: leitura viewer+, escrita admin+.
grant select, delete on public.supplier_connections to authenticated;
grant insert (organization_id, supplier_source_id, display_name, status, configuration, dropship_agreement_confirmed)
  on public.supplier_connections to authenticated;
grant update (display_name, status, configuration, dropship_agreement_confirmed)
  on public.supplier_connections to authenticated;
create policy supplier_connections_select on public.supplier_connections for select to authenticated
  using (organization_id in (select private.org_ids_with_role('viewer')));
create policy supplier_connections_insert on public.supplier_connections for insert to authenticated
  with check (organization_id in (select private.org_ids_with_role('admin')));
create policy supplier_connections_update on public.supplier_connections for update to authenticated
  using (organization_id in (select private.org_ids_with_role('admin')))
  with check (organization_id in (select private.org_ids_with_role('admin')));
create policy supplier_connections_delete on public.supplier_connections for delete to authenticated
  using (organization_id in (select private.org_ids_with_role('admin')));

-- catalog_products: leitura viewer+, escrita operator+, exclusão admin+.
grant select, delete on public.catalog_products to authenticated;
grant insert (organization_id, title, normalized_title, brand, model, category, description, gtin, identifiers, attributes, images, is_example)
  on public.catalog_products to authenticated;
grant update (title, normalized_title, brand, model, category, description, gtin, identifiers, attributes, images)
  on public.catalog_products to authenticated;
create policy catalog_products_select on public.catalog_products for select to authenticated
  using (organization_id in (select private.org_ids_with_role('viewer')));
create policy catalog_products_insert on public.catalog_products for insert to authenticated
  with check (organization_id in (select private.org_ids_with_role('operator')));
create policy catalog_products_update on public.catalog_products for update to authenticated
  using (organization_id in (select private.org_ids_with_role('operator')))
  with check (organization_id in (select private.org_ids_with_role('operator')));
create policy catalog_products_delete on public.catalog_products for delete to authenticated
  using (organization_id in (select private.org_ids_with_role('admin')));

-- supplier_offers
grant select, delete on public.supplier_offers to authenticated;
grant insert (organization_id, supplier_source_id, supplier_connection_id, catalog_product_id, external_offer_id, sku,
  supplier_cost, inbound_shipping_cost, supplier_handling_fee, available_stock, handling_time_days, currency, source,
  status, cost_updated_at)
  on public.supplier_offers to authenticated;
grant update (external_offer_id, supplier_cost, inbound_shipping_cost, supplier_handling_fee, available_stock,
  handling_time_days, status, cost_updated_at)
  on public.supplier_offers to authenticated;
create policy supplier_offers_select on public.supplier_offers for select to authenticated
  using (organization_id in (select private.org_ids_with_role('viewer')));
create policy supplier_offers_insert on public.supplier_offers for insert to authenticated
  with check (organization_id in (select private.org_ids_with_role('operator')));
create policy supplier_offers_update on public.supplier_offers for update to authenticated
  using (organization_id in (select private.org_ids_with_role('operator')))
  with check (organization_id in (select private.org_ids_with_role('operator')));
create policy supplier_offers_delete on public.supplier_offers for delete to authenticated
  using (organization_id in (select private.org_ids_with_role('admin')));

-- catalog_import_runs
grant select on public.catalog_import_runs to authenticated;
grant insert (organization_id, supplier_connection_id, file_name, file_type, file_sha256, status, column_mapping,
  rows_total, rows_rejected, errors, created_by)
  on public.catalog_import_runs to authenticated;
grant update (status, rows_processed, rows_imported, rows_updated, rows_rejected, errors, finished_at)
  on public.catalog_import_runs to authenticated;
create policy catalog_import_runs_select on public.catalog_import_runs for select to authenticated
  using (organization_id in (select private.org_ids_with_role('viewer')));
create policy catalog_import_runs_insert on public.catalog_import_runs for insert to authenticated
  with check (organization_id in (select private.org_ids_with_role('operator')) and created_by = (select auth.uid()));
create policy catalog_import_runs_update on public.catalog_import_runs for update to authenticated
  using (organization_id in (select private.org_ids_with_role('operator')))
  with check (organization_id in (select private.org_ids_with_role('operator')));

-- competitor_snapshots (somente inserção; histórico imutável)
grant select on public.competitor_snapshots to authenticated;
grant insert (organization_id, marketplace, external_item_id, catalog_product_id, title, seller_id, observed_price,
  observed_shipping, currency, source, source_url, observed_at, metadata)
  on public.competitor_snapshots to authenticated;
create policy competitor_snapshots_select on public.competitor_snapshots for select to authenticated
  using (organization_id in (select private.org_ids_with_role('viewer')));
create policy competitor_snapshots_insert on public.competitor_snapshots for insert to authenticated
  with check (organization_id in (select private.org_ids_with_role('operator')));

-- A origem da oferta é sempre derivada da conexão (não confia no valor enviado pelo cliente).
create or replace function private.offer_source_from_connection()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  select c.supplier_source_id into new.supplier_source_id
  from public.supplier_connections c
  where c.id = new.supplier_connection_id and c.organization_id = new.organization_id;
  if new.supplier_source_id is null then
    raise exception 'conexão de fornecedor inválida' using errcode = '23503';
  end if;
  return new;
end;
$$;
create trigger supplier_offers_source before insert on public.supplier_offers
  for each row execute function private.offer_source_from_connection();
