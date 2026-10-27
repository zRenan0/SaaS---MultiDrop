-- Formação de preço: perfis, versões imutáveis de regras, tarifas com fonte e histórico de cálculos.
-- Taxas são armazenadas como fração (0.12 = 12%).

create table public.pricing_profiles (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null check (char_length(name) between 2 and 80),
  target_margin numeric(7, 6) not null check (target_margin >= 0 and target_margin < 0.9),
  default_tax_rate numeric(7, 6) not null default 0 check (default_tax_rate >= 0 and default_tax_rate < 0.6),
  default_reserve_rate numeric(7, 6) not null default 0 check (default_reserve_rate >= 0 and default_reserve_rate < 0.5),
  settings jsonb not null default '{}'::jsonb check (jsonb_typeof(settings) = 'object'),
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, name)
);
create unique index pricing_profiles_default_idx on public.pricing_profiles (organization_id) where is_default;
create trigger pricing_profiles_updated_at before update on public.pricing_profiles
  for each row execute function private.set_updated_at();
create trigger pricing_profiles_org_immutable before update on public.pricing_profiles
  for each row execute function private.prevent_organization_change();

create table public.pricing_rule_versions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  profile_id uuid not null,
  version integer not null check (version > 0),
  rules jsonb not null check (jsonb_typeof(rules) = 'object'),
  effective_at timestamptz not null default now(),
  source text not null default 'user' check (source in ('user', 'system')),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (profile_id, version),
  foreign key (organization_id, profile_id)
    references public.pricing_profiles(organization_id, id) on delete cascade
);

-- Versão sequencial calculada no banco (o cliente não escolhe o número).
create or replace function private.next_pricing_rule_version()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  perform pg_advisory_xact_lock(hashtext('pricing_rule_versions:' || new.profile_id::text));
  select coalesce(max(version), 0) + 1 into new.version
  from public.pricing_rule_versions where profile_id = new.profile_id;
  return new;
end;
$$;
create trigger pricing_rule_versions_number before insert on public.pricing_rule_versions
  for each row execute function private.next_pricing_rule_version();

-- Tarifas do marketplace. organization_id NULL = obtida da API oficial (compartilhável, sem dado de tenant);
-- organization_id preenchido = parâmetro manual/estimado da organização.
create table public.marketplace_fee_snapshots (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete cascade,
  marketplace text not null check (marketplace in ('mercado_livre')),
  site_id text not null default 'MLB',
  category_id text,
  listing_type text not null,
  price_min numeric(14, 2),
  price_max numeric(14, 2),
  fixed_fee numeric(14, 2) not null default 0 check (fixed_fee >= 0),
  variable_fee_rate numeric(7, 6) not null check (variable_fee_rate >= 0 and variable_fee_rate < 1),
  shipping_estimate numeric(14, 2) check (shipping_estimate is null or shipping_estimate >= 0),
  source text not null check (source in ('ml_api_listing_prices', 'manual')),
  notes text,
  raw jsonb not null default '{}'::jsonb,
  effective_at timestamptz not null default now(),
  retrieved_at timestamptz not null default now(),
  check ((source = 'manual') = (organization_id is not null)),
  check (price_min is null or price_max is null or price_max >= price_min)
);
create index marketplace_fee_snapshots_lookup_idx
  on public.marketplace_fee_snapshots (marketplace, site_id, category_id, listing_type, retrieved_at desc);

create table public.pricing_calculations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  catalog_product_id uuid,
  supplier_offer_id uuid,
  marketplace_account_id uuid,
  pricing_profile_id uuid,
  pricing_rule_version_id uuid,
  input_snapshot jsonb not null,
  result_snapshot jsonb not null,
  cost_total numeric(14, 2) not null,
  selling_price numeric(14, 2) not null,
  estimated_fees numeric(14, 2) not null,
  estimated_tax numeric(14, 2) not null,
  estimated_profit numeric(14, 2) not null,
  estimated_margin numeric(9, 6),
  break_even_price numeric(14, 2),
  currency char(3) not null default 'BRL',
  calculation_version text not null,
  has_estimates boolean not null,
  missing_inputs text[] not null default '{}',
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (organization_id, id),
  foreign key (organization_id, catalog_product_id)
    references public.catalog_products(organization_id, id) on delete cascade,
  foreign key (organization_id, supplier_offer_id)
    references public.supplier_offers(organization_id, id) on delete set null (supplier_offer_id),
  foreign key (organization_id, marketplace_account_id)
    references public.marketplace_accounts(organization_id, id) on delete set null (marketplace_account_id),
  foreign key (organization_id, pricing_profile_id)
    references public.pricing_profiles(organization_id, id) on delete set null (pricing_profile_id),
  foreign key (organization_id, pricing_rule_version_id)
    references public.pricing_rule_versions(organization_id, id) on delete set null (pricing_rule_version_id)
);
create index pricing_calculations_product_idx on public.pricing_calculations (organization_id, catalog_product_id, created_at desc);

alter table public.listing_drafts
  add constraint listing_drafts_pricing_calculation_fk
  foreign key (organization_id, pricing_calculation_id)
  references public.pricing_calculations(organization_id, id) on delete set null (pricing_calculation_id);

-- RLS
alter table public.pricing_profiles enable row level security;
alter table public.pricing_rule_versions enable row level security;
alter table public.marketplace_fee_snapshots enable row level security;
alter table public.pricing_calculations enable row level security;

revoke all on public.pricing_profiles, public.pricing_rule_versions, public.marketplace_fee_snapshots,
  public.pricing_calculations from anon, authenticated;

grant select, delete on public.pricing_profiles to authenticated;
grant insert (organization_id, name, target_margin, default_tax_rate, default_reserve_rate, settings, is_default)
  on public.pricing_profiles to authenticated;
grant update (name, target_margin, default_tax_rate, default_reserve_rate, settings, is_default)
  on public.pricing_profiles to authenticated;
create policy pricing_profiles_select on public.pricing_profiles for select to authenticated
  using (organization_id in (select private.org_ids_with_role('viewer')));
create policy pricing_profiles_insert on public.pricing_profiles for insert to authenticated
  with check (organization_id in (select private.org_ids_with_role('admin')));
create policy pricing_profiles_update on public.pricing_profiles for update to authenticated
  using (organization_id in (select private.org_ids_with_role('admin')))
  with check (organization_id in (select private.org_ids_with_role('admin')));
create policy pricing_profiles_delete on public.pricing_profiles for delete to authenticated
  using (organization_id in (select private.org_ids_with_role('admin')));

grant select on public.pricing_rule_versions to authenticated;
grant insert (organization_id, profile_id, rules, effective_at, created_by) on public.pricing_rule_versions to authenticated;
create policy pricing_rule_versions_select on public.pricing_rule_versions for select to authenticated
  using (organization_id in (select private.org_ids_with_role('viewer')));
create policy pricing_rule_versions_insert on public.pricing_rule_versions for insert to authenticated
  with check (organization_id in (select private.org_ids_with_role('admin')) and created_by = (select auth.uid()));

grant select, delete on public.marketplace_fee_snapshots to authenticated;
grant insert (organization_id, marketplace, site_id, category_id, listing_type, price_min, price_max, fixed_fee,
  variable_fee_rate, shipping_estimate, source, notes, effective_at)
  on public.marketplace_fee_snapshots to authenticated;
create policy fee_snapshots_select on public.marketplace_fee_snapshots for select to authenticated
  using (organization_id is null or organization_id in (select private.org_ids_with_role('viewer')));
create policy fee_snapshots_insert on public.marketplace_fee_snapshots for insert to authenticated
  with check (source = 'manual' and organization_id in (select private.org_ids_with_role('admin')));
create policy fee_snapshots_delete on public.marketplace_fee_snapshots for delete to authenticated
  using (organization_id in (select private.org_ids_with_role('admin')));

grant select on public.pricing_calculations to authenticated;
grant insert (organization_id, catalog_product_id, supplier_offer_id, marketplace_account_id, pricing_profile_id,
  pricing_rule_version_id, input_snapshot, result_snapshot, cost_total, selling_price, estimated_fees, estimated_tax,
  estimated_profit, estimated_margin, break_even_price, currency, calculation_version, has_estimates, missing_inputs,
  created_by)
  on public.pricing_calculations to authenticated;
create policy pricing_calculations_select on public.pricing_calculations for select to authenticated
  using (organization_id in (select private.org_ids_with_role('viewer')));
create policy pricing_calculations_insert on public.pricing_calculations for insert to authenticated
  with check (organization_id in (select private.org_ids_with_role('operator')) and created_by = (select auth.uid()));
