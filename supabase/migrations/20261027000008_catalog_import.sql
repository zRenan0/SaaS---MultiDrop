-- Gravação em lote de produtos/ofertas (cadastro manual e importação) numa única transação.
-- SECURITY INVOKER: executa com os privilégios e políticas RLS do usuário que chamou.
-- Deduplicação conservadora:
--   1) oferta existente com o mesmo SKU no mesmo fornecedor -> atualiza custo/estoque/prazo;
--   2) produto existente com o mesmo GTIN -> reutiliza;
--   3) produto existente com mesmo título normalizado, marca e modelo -> reutiliza;
--   4) caso contrário cria um produto novo.

create or replace function public.upsert_catalog_rows(
  p_organization_id uuid,
  p_connection_id uuid,
  p_source text,
  p_rows jsonb
)
returns table (created_products integer, created_offers integer, updated_offers integer)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  r record;
  v_offer_id uuid;
  v_product_id uuid;
  v_created_products integer := 0;
  v_created_offers integer := 0;
  v_updated_offers integer := 0;
begin
  if p_source not in ('manual', 'file_import', 'api') then
    raise exception 'origem inválida' using errcode = '22023';
  end if;
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) > 5000 then
    raise exception 'lote inválido (máximo 5000 linhas)' using errcode = '22023';
  end if;

  for r in
    select * from jsonb_to_recordset(p_rows) as x(
      title text, normalized_title text, brand text, model text, category text, description text, gtin text,
      sku text, external_offer_id text, cost numeric, inbound_shipping_cost numeric, handling_fee numeric,
      stock integer, handling_time_days integer, images jsonb, is_example boolean
    )
  loop
    select o.id into v_offer_id
    from public.supplier_offers o
    where o.organization_id = p_organization_id and o.supplier_connection_id = p_connection_id and o.sku = r.sku;

    if v_offer_id is not null then
      update public.supplier_offers o
      set supplier_cost = r.cost,
          inbound_shipping_cost = coalesce(r.inbound_shipping_cost, 0),
          supplier_handling_fee = coalesce(r.handling_fee, 0),
          available_stock = r.stock,
          handling_time_days = r.handling_time_days,
          external_offer_id = coalesce(r.external_offer_id, o.external_offer_id),
          cost_updated_at = now(),
          status = case
            when r.stock = 0 and o.status = 'active' then 'out_of_stock'::public.offer_status
            when r.stock > 0 and o.status = 'out_of_stock' then 'active'::public.offer_status
            else o.status
          end
      where o.id = v_offer_id;
      v_updated_offers := v_updated_offers + 1;
      continue;
    end if;

    v_product_id := null;
    if r.gtin is not null then
      select p.id into v_product_id from public.catalog_products p
      where p.organization_id = p_organization_id and p.gtin = r.gtin;
    end if;
    if v_product_id is null then
      select p.id into v_product_id from public.catalog_products p
      where p.organization_id = p_organization_id
        and p.normalized_title = r.normalized_title
        and coalesce(lower(p.brand), '') = coalesce(lower(r.brand), '')
        and coalesce(lower(p.model), '') = coalesce(lower(r.model), '')
      order by p.created_at
      limit 1;
    end if;
    if v_product_id is null then
      insert into public.catalog_products (organization_id, title, normalized_title, brand, model, category, description, gtin, images, is_example)
      values (p_organization_id, r.title, r.normalized_title, r.brand, r.model, r.category, r.description, r.gtin,
              coalesce(r.images, '[]'::jsonb), coalesce(r.is_example, false))
      returning id into v_product_id;
      v_created_products := v_created_products + 1;
    end if;

    insert into public.supplier_offers (
      organization_id, supplier_connection_id, catalog_product_id, external_offer_id, sku, supplier_cost,
      inbound_shipping_cost, supplier_handling_fee, available_stock, handling_time_days, source, status
    ) values (
      p_organization_id, p_connection_id, v_product_id, r.external_offer_id, r.sku, r.cost,
      coalesce(r.inbound_shipping_cost, 0), coalesce(r.handling_fee, 0), r.stock, r.handling_time_days, p_source,
      case when r.stock = 0 then 'out_of_stock'::public.offer_status else 'active'::public.offer_status end
    );
    v_created_offers := v_created_offers + 1;
  end loop;

  return query select v_created_products, v_created_offers, v_updated_offers;
end;
$$;

revoke all on function public.upsert_catalog_rows(uuid, uuid, text, jsonb) from public, anon;
grant execute on function public.upsert_catalog_rows(uuid, uuid, text, jsonb) to authenticated, service_role;
