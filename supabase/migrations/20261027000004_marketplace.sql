-- Contas de marketplace, credenciais cifradas (schema privado), estado OAuth, rascunhos e anúncios.

create type public.marketplace_account_status as enum ('active', 'reauthorization_required', 'disconnected', 'error');
create type public.listing_draft_status as enum ('draft', 'validated', 'invalid', 'publishing', 'published', 'failed');

create table public.marketplace_accounts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  marketplace text not null check (marketplace in ('mercado_livre')),
  site_id text not null default 'MLB' check (site_id ~ '^[A-Z]{3}$'),
  external_account_id text not null,
  nickname text,
  status public.marketplace_account_status not null default 'active',
  granted_scopes text[] not null default '{}',
  -- Tag "user_product_seller" retornada por /users/{id}; null = ainda não verificado.
  user_product_seller boolean,
  account_tags text[] not null default '{}',
  last_synced_at timestamptz,
  last_error text,
  connected_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id)
);
-- Uma conta do marketplace só pode estar conectada a uma organização por vez (tokens nunca são compartilhados).
create unique index marketplace_accounts_external_active_idx
  on public.marketplace_accounts (marketplace, external_account_id) where status <> 'disconnected';
create trigger marketplace_accounts_updated_at before update on public.marketplace_accounts
  for each row execute function private.set_updated_at();
create trigger marketplace_accounts_org_immutable before update on public.marketplace_accounts
  for each row execute function private.prevent_organization_change();
create trigger marketplace_accounts_plan_limit before insert on public.marketplace_accounts
  for each row execute function private.enforce_plan_limit('max_marketplace_accounts', 'status <> ''disconnected''');

-- Credenciais: nunca expostas pela API. Tokens cifrados com AES-256-GCM no servidor (chave fora do banco).
create table private.marketplace_credentials (
  marketplace_account_id uuid primary key,
  organization_id uuid not null,
  encrypted_access_token text not null,
  encrypted_refresh_token text,
  expires_at timestamptz not null,
  encryption_key_version integer not null,
  -- Incrementado a cada renovação; usado para compare-and-swap entre renovações concorrentes.
  token_generation bigint not null default 1,
  refreshed_at timestamptz,
  updated_at timestamptz not null default now(),
  foreign key (organization_id, marketplace_account_id)
    references public.marketplace_accounts(organization_id, id) on delete cascade
);
revoke all on private.marketplace_credentials from public, anon, authenticated;

-- Estado OAuth de uso único, vinculado ao usuário e à organização que iniciaram o fluxo.
create table private.oauth_states (
  state_hash text primary key,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  marketplace text not null,
  encrypted_code_verifier text not null,
  encryption_key_version integer not null,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);
create index oauth_states_expires_idx on private.oauth_states (expires_at);
revoke all on private.oauth_states from public, anon, authenticated;

create table public.listing_drafts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  marketplace_account_id uuid,
  catalog_product_id uuid not null,
  supplier_offer_id uuid,
  -- Fluxo legado usa "title"; vendedores User Products usam "family_name" (o título é gerado pelo ML).
  title text check (title is null or char_length(title) <= 120),
  family_name text check (family_name is null or char_length(family_name) <= 120),
  category_id text check (category_id is null or category_id ~ '^[A-Z]{3}[0-9]+$'),
  listing_type_id text,
  condition text not null default 'new' check (condition in ('new', 'used', 'not_specified')),
  attributes jsonb not null default '[]'::jsonb check (jsonb_typeof(attributes) = 'array'),
  pictures jsonb not null default '[]'::jsonb check (jsonb_typeof(pictures) = 'array'),
  description text check (description is null or char_length(description) <= 50000),
  target_price numeric(14, 2) check (target_price is null or target_price > 0),
  target_stock integer check (target_stock is null or target_stock >= 0),
  pricing_calculation_id uuid,
  status public.listing_draft_status not null default 'draft',
  validation_errors jsonb not null default '[]'::jsonb,
  validated_at timestamptz,
  -- Chave de idempotência da publicação: impede publicar duas vezes o mesmo rascunho.
  idempotency_key uuid not null default gen_random_uuid() unique,
  published_listing_id uuid,
  last_error text,
  version integer not null default 1,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  foreign key (organization_id, marketplace_account_id)
    references public.marketplace_accounts(organization_id, id) on delete set null (marketplace_account_id),
  foreign key (organization_id, catalog_product_id)
    references public.catalog_products(organization_id, id) on delete cascade,
  foreign key (organization_id, supplier_offer_id)
    references public.supplier_offers(organization_id, id) on delete set null (supplier_offer_id)
);
create index listing_drafts_org_idx on public.listing_drafts (organization_id, updated_at desc);
create trigger listing_drafts_updated_at before update on public.listing_drafts
  for each row execute function private.set_updated_at();
create trigger listing_drafts_version before update on public.listing_drafts
  for each row execute function private.bump_version();
create trigger listing_drafts_org_immutable before update on public.listing_drafts
  for each row execute function private.prevent_organization_change();

-- Alterar o conteúdo invalida a validação anterior; rascunhos em publicação/publicados ficam travados.
create or replace function private.listing_draft_content_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  content_changed boolean;
begin
  content_changed :=
    new.marketplace_account_id is distinct from old.marketplace_account_id
    or new.supplier_offer_id is distinct from old.supplier_offer_id
    or new.title is distinct from old.title
    or new.family_name is distinct from old.family_name
    or new.category_id is distinct from old.category_id
    or new.listing_type_id is distinct from old.listing_type_id
    or new.condition is distinct from old.condition
    or new.attributes is distinct from old.attributes
    or new.pictures is distinct from old.pictures
    or new.description is distinct from old.description
    or new.target_price is distinct from old.target_price
    or new.target_stock is distinct from old.target_stock;

  if content_changed then
    if old.status in ('publishing', 'published') then
      raise exception 'rascunho em publicação ou publicado não pode ser alterado' using errcode = 'P0001';
    end if;
    if new.status is not distinct from old.status then
      new.status := 'draft';
      new.validation_errors := '[]'::jsonb;
      new.validated_at := null;
    end if;
  end if;
  return new;
end;
$$;
create trigger listing_drafts_content_guard before update on public.listing_drafts
  for each row execute function private.listing_draft_content_guard();

create table public.marketplace_listings (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  marketplace_account_id uuid not null,
  catalog_product_id uuid,
  supplier_offer_id uuid,
  listing_draft_id uuid,
  external_item_id text not null,
  external_user_product_id text,
  family_name text,
  title text,
  status text not null,
  price numeric(14, 2),
  available_stock integer,
  permalink text,
  -- Sincronização automática de estoque/preço a partir da oferta do fornecedor.
  auto_sync_stock boolean not null default true,
  last_synced_at timestamptz,
  raw jsonb not null default '{}'::jsonb,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (marketplace_account_id, external_item_id),
  foreign key (organization_id, marketplace_account_id)
    references public.marketplace_accounts(organization_id, id) on delete cascade,
  foreign key (organization_id, catalog_product_id)
    references public.catalog_products(organization_id, id) on delete set null (catalog_product_id),
  foreign key (organization_id, supplier_offer_id)
    references public.supplier_offers(organization_id, id) on delete set null (supplier_offer_id),
  foreign key (organization_id, listing_draft_id)
    references public.listing_drafts(organization_id, id) on delete set null (listing_draft_id)
);
create index marketplace_listings_offer_idx on public.marketplace_listings (organization_id, supplier_offer_id);
create index marketplace_listings_up_idx on public.marketplace_listings (marketplace_account_id, external_user_product_id);
create trigger marketplace_listings_updated_at before update on public.marketplace_listings
  for each row execute function private.set_updated_at();
create trigger marketplace_listings_version before update on public.marketplace_listings
  for each row execute function private.bump_version();
create trigger marketplace_listings_org_immutable before update on public.marketplace_listings
  for each row execute function private.prevent_organization_change();
create trigger marketplace_listings_plan_limit before insert on public.marketplace_listings
  for each row execute function private.enforce_plan_limit('max_active_listings', 'status in (''active'', ''paused'', ''under_review'')');

alter table public.listing_drafts
  add constraint listing_drafts_published_listing_fk
  foreign key (organization_id, published_listing_id)
  references public.marketplace_listings(organization_id, id) on delete set null (published_listing_id);

create table public.listing_variants (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  marketplace_listing_id uuid not null,
  external_variant_id text,
  external_item_id text,
  external_user_product_id text,
  sku text,
  attributes jsonb not null default '[]'::jsonb,
  price numeric(14, 2),
  available_stock integer,
  status text,
  updated_at timestamptz not null default now(),
  foreign key (organization_id, marketplace_listing_id)
    references public.marketplace_listings(organization_id, id) on delete cascade,
  unique (marketplace_listing_id, external_variant_id)
);

-- RLS: contas e anúncios são gravados pelo servidor (service role) após autorização no código,
-- pois refletem respostas reais da API. Usuários leem; rascunhos são editáveis por operadores.
alter table public.marketplace_accounts enable row level security;
alter table public.listing_drafts enable row level security;
alter table public.marketplace_listings enable row level security;
alter table public.listing_variants enable row level security;

revoke all on public.marketplace_accounts, public.listing_drafts, public.marketplace_listings,
  public.listing_variants from anon, authenticated;

grant select on public.marketplace_accounts to authenticated;
create policy marketplace_accounts_select on public.marketplace_accounts for select to authenticated
  using (organization_id in (select private.org_ids_with_role('viewer')));

grant select, delete on public.listing_drafts to authenticated;
grant insert (organization_id, marketplace_account_id, catalog_product_id, supplier_offer_id, title, family_name,
  category_id, listing_type_id, condition, attributes, pictures, description, target_price, target_stock,
  pricing_calculation_id, created_by)
  on public.listing_drafts to authenticated;
grant update (marketplace_account_id, supplier_offer_id, title, family_name, category_id, listing_type_id, condition,
  attributes, pictures, description, target_price, target_stock, pricing_calculation_id)
  on public.listing_drafts to authenticated;
create policy listing_drafts_select on public.listing_drafts for select to authenticated
  using (organization_id in (select private.org_ids_with_role('viewer')));
create policy listing_drafts_insert on public.listing_drafts for insert to authenticated
  with check (organization_id in (select private.org_ids_with_role('operator')) and created_by = (select auth.uid()));
create policy listing_drafts_update on public.listing_drafts for update to authenticated
  using (organization_id in (select private.org_ids_with_role('operator')))
  with check (organization_id in (select private.org_ids_with_role('operator')));
create policy listing_drafts_delete on public.listing_drafts for delete to authenticated
  using (organization_id in (select private.org_ids_with_role('operator')) and status not in ('publishing', 'published'));

grant select on public.marketplace_listings to authenticated;
grant update (auto_sync_stock) on public.marketplace_listings to authenticated;
create policy marketplace_listings_select on public.marketplace_listings for select to authenticated
  using (organization_id in (select private.org_ids_with_role('viewer')));
create policy marketplace_listings_update on public.marketplace_listings for update to authenticated
  using (organization_id in (select private.org_ids_with_role('operator')))
  with check (organization_id in (select private.org_ids_with_role('operator')));

grant select on public.listing_variants to authenticated;
create policy listing_variants_select on public.listing_variants for select to authenticated
  using (organization_id in (select private.org_ids_with_role('viewer')));
