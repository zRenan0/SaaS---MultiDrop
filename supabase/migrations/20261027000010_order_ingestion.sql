-- Ingestão idempotente de pedidos do marketplace (executada somente pelo servidor/fila).
-- Garante: um pedido por (conta, pedido externo); itens sem duplicidade; baixa de estoque do fornecedor uma única vez
-- quando o pedido fica pago; devolução do estoque se for cancelado antes do envio; problemas registrados para o operador.

create or replace function public.ingest_marketplace_order(p_account_id uuid, p_order jsonb)
returns table (order_id uuid, created boolean, fulfillment public.fulfillment_status, problems text[])
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  acc record;
  existing record;
  v_order_id uuid;
  v_created boolean := false;
  v_status text := p_order ->> 'status';
  v_meta jsonb;
  v_fulfillment public.fulfillment_status;
  v_problems text[] := '{}';
  it jsonb;
  v_listing record;
  oi record;
  v_prev_stock integer;
begin
  select a.id, a.organization_id, a.external_account_id into acc
  from public.marketplace_accounts a where a.id = p_account_id and a.status <> 'disconnected';
  if acc.id is null then
    raise exception 'conta inexistente ou desconectada' using errcode = 'P0002';
  end if;
  -- O pedido precisa pertencer ao vendedor da conta (não confia no conteúdo da notificação).
  if coalesce(p_order -> 'seller' ->> 'id', '') <> acc.external_account_id then
    raise exception 'pedido não pertence à conta conectada' using errcode = '42501';
  end if;
  if coalesce(p_order ->> 'id', '') = '' or jsonb_typeof(p_order -> 'order_items') <> 'array' then
    raise exception 'pedido em formato inválido' using errcode = '22023';
  end if;

  select o.id, o.metadata, o.fulfillment_status into existing
  from public.orders o
  where o.marketplace_account_id = acc.id and o.external_order_id = p_order ->> 'id'
  for update;

  if existing.id is null then
    insert into public.orders (organization_id, marketplace_account_id, external_order_id, external_pack_id, external_shipment_id,
      status, total_amount, currency, buyer_nickname, ordered_at, metadata)
    values (acc.organization_id, acc.id, p_order ->> 'id', p_order ->> 'pack_id', p_order -> 'shipping' ->> 'id',
      v_status, (p_order ->> 'total_amount')::numeric, coalesce(p_order ->> 'currency_id', 'BRL'), p_order -> 'buyer' ->> 'nickname',
      (p_order ->> 'date_created')::timestamptz, jsonb_build_object('tags', coalesce(p_order -> 'tags', '[]'::jsonb)))
    on conflict (marketplace_account_id, external_order_id) do nothing
    returning id into v_order_id;
    if v_order_id is null then
      -- Corrida com outro processo: o pedido acabou de ser criado; bloqueia e segue como atualização.
      select o.id, o.metadata, o.fulfillment_status into existing
      from public.orders o where o.marketplace_account_id = acc.id and o.external_order_id = p_order ->> 'id' for update;
      v_order_id := existing.id;
    else
      v_created := true;
      select o.id, o.metadata, o.fulfillment_status into existing from public.orders o where o.id = v_order_id;
    end if;
  else
    v_order_id := existing.id;
  end if;

  update public.orders o
  set status = v_status,
      total_amount = (p_order ->> 'total_amount')::numeric,
      external_shipment_id = coalesce(p_order -> 'shipping' ->> 'id', o.external_shipment_id),
      external_pack_id = coalesce(p_order ->> 'pack_id', o.external_pack_id),
      last_synced_at = now(),
      metadata = o.metadata || jsonb_build_object('tags', coalesce(p_order -> 'tags', '[]'::jsonb))
  where o.id = v_order_id;

  for it in select value from jsonb_array_elements(p_order -> 'order_items') loop
    select l.id, l.supplier_offer_id into v_listing
    from public.marketplace_listings l
    where l.marketplace_account_id = acc.id and l.external_item_id = it -> 'item' ->> 'id';

    insert into public.order_items (organization_id, order_id, marketplace_listing_id, supplier_offer_id, external_item_id,
      external_variation_id, sku, title, quantity, unit_price, item_total, sale_fee)
    values (acc.organization_id, v_order_id, v_listing.id, v_listing.supplier_offer_id, it -> 'item' ->> 'id',
      coalesce(it -> 'item' ->> 'variation_id', ''), it -> 'item' ->> 'seller_sku', it -> 'item' ->> 'title',
      (it ->> 'quantity')::integer, (it ->> 'unit_price')::numeric,
      round((it ->> 'unit_price')::numeric * (it ->> 'quantity')::integer, 2), nullif(it ->> 'sale_fee', '')::numeric)
    on conflict (order_id, external_item_id, external_variation_id) do update
      set quantity = excluded.quantity,
          unit_price = excluded.unit_price,
          item_total = excluded.item_total,
          sale_fee = excluded.sale_fee,
          marketplace_listing_id = coalesce(public.order_items.marketplace_listing_id, excluded.marketplace_listing_id),
          supplier_offer_id = coalesce(public.order_items.supplier_offer_id, excluded.supplier_offer_id);

    if v_listing.id is null then
      v_problems := v_problems || format('Item %s não corresponde a um anúncio publicado por esta plataforma.', it -> 'item' ->> 'id');
    elsif v_listing.supplier_offer_id is null then
      v_problems := v_problems || format('Anúncio %s sem oferta de fornecedor associada.', it -> 'item' ->> 'id');
    end if;
  end loop;

  select o.metadata into v_meta from public.orders o where o.id = v_order_id;

  -- Baixa de estoque do fornecedor uma única vez quando pago.
  if v_status = 'paid' and coalesce((v_meta ->> 'stock_applied')::boolean, false) = false then
    for oi in
      select i.supplier_offer_id, i.quantity, i.external_item_id, so.sku
      from public.order_items i join public.supplier_offers so on so.id = i.supplier_offer_id
      where i.order_id = v_order_id
    loop
      select so.available_stock into v_prev_stock from public.supplier_offers so where so.id = oi.supplier_offer_id for update;
      update public.supplier_offers so
      set available_stock = greatest(0, so.available_stock - oi.quantity),
          status = case when so.available_stock - oi.quantity <= 0 and so.status = 'active' then 'out_of_stock'::public.offer_status else so.status end
      where so.id = oi.supplier_offer_id;
      if v_prev_stock < oi.quantity then
        v_problems := v_problems || format('Estoque registrado do fornecedor insuficiente para o SKU %s (disponível %s, vendido %s). Confirme com o fornecedor.', oi.sku, v_prev_stock, oi.quantity);
      end if;
    end loop;
    v_meta := v_meta || jsonb_build_object('stock_applied', true, 'stock_applied_at', now());
  end if;

  -- Cancelamento antes do envio devolve o estoque reservado.
  if v_status = 'cancelled' and coalesce((v_meta ->> 'stock_applied')::boolean, false)
     and not coalesce((v_meta ->> 'stock_restored')::boolean, false)
     and existing.fulfillment_status not in ('shipped', 'delivered') then
    update public.supplier_offers so
    set available_stock = so.available_stock + i.quantity,
        status = case when so.status = 'out_of_stock' then 'active'::public.offer_status else so.status end
    from public.order_items i
    where i.order_id = v_order_id and so.id = i.supplier_offer_id;
    v_meta := v_meta || jsonb_build_object('stock_restored', true);
  end if;

  v_fulfillment := existing.fulfillment_status;
  if v_status = 'cancelled' and v_fulfillment not in ('shipped', 'delivered') then
    v_fulfillment := 'canceled';
  elsif v_status = 'paid' and v_fulfillment in ('pending', 'problem') then
    v_fulfillment := case when cardinality(v_problems) = 0 then 'awaiting_supplier'::public.fulfillment_status else 'problem'::public.fulfillment_status end;
  end if;

  update public.orders o
  set fulfillment_status = v_fulfillment,
      metadata = v_meta || jsonb_build_object('problems', to_jsonb(v_problems))
  where o.id = v_order_id;

  return query select v_order_id, v_created, v_fulfillment, v_problems;
end;
$$;

revoke all on function public.ingest_marketplace_order(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.ingest_marketplace_order(uuid, jsonb) to service_role;

-- Consulta eficiente de eventos por recurso (reprocessamento e diagnóstico).
create index if not exists webhook_events_resource_idx on public.webhook_events (marketplace, resource, received_at desc);
