-- Estado da sincronização automática de estoque do anúncio.
alter table public.marketplace_listings
  add column paused_by_sync boolean not null default false,
  add column last_sync_error text;
