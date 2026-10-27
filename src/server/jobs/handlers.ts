import "server-only";
import { z } from "zod";
import type { AdminSupabaseClient } from "@/lib/supabase/admin";
import { asJson } from "@/lib/db-values";
import { ingestOrder, loadAccount } from "@/features/orders/ingest";
import { getUsage } from "@/features/billing/service";
import { mlClientForAccount } from "@/server/integrations/mercado-livre/factory";
import { MlApiError } from "@/server/integrations/mercado-livre/http";
import { JobError, type JobHandler } from "@/server/jobs/types";

const ORDER_RESOURCE = /^\/orders\/(\d{1,20})$/;
const ITEM_RESOURCE = /^\/items\/([A-Z]{3}\d{1,20})$/;
const SHIPMENT_RESOURCE = /^\/shipments\/(\d{1,20})$/;

function payloadOf<T extends z.ZodType>(schema: T, payload: unknown): z.infer<T> {
  const parsed = schema.safeParse(payload);
  if (!parsed.success) throw new JobError("Payload da tarefa inválido.", false, "invalid_payload");
  return parsed.data;
}

async function markEvent(admin: AdminSupabaseClient, id: string, status: "processed" | "ignored" | "failed", lastError?: string) {
  const { data } = await admin.from("webhook_events").select("attempts").eq("id", id).maybeSingle();
  await admin
    .from("webhook_events")
    .update({ status, processed_at: new Date().toISOString(), last_error: lastError ?? null, attempts: (data?.attempts ?? 0) + 1 })
    .eq("id", id);
}

/** Atualiza o anúncio local a partir do estado oficial. */
async function refreshListing(admin: AdminSupabaseClient, accountId: string, siteId: string, itemId: string) {
  const { data: listing } = await admin.from("marketplace_listings").select("id").eq("marketplace_account_id", accountId).eq("external_item_id", itemId).maybeSingle();
  if (!listing) return { ignored: "anúncio não gerenciado pela plataforma" };
  const item = await mlClientForAccount(accountId, siteId).getItem(itemId);
  await admin
    .from("marketplace_listings")
    .update({ status: item.status, price: item.price ?? null, available_stock: item.available_quantity ?? null, permalink: item.permalink ?? null, last_synced_at: new Date().toISOString(), raw: asJson(item) })
    .eq("id", listing.id);
  return { listingId: listing.id, status: item.status };
}

const notification: JobHandler = async (job, { admin, enqueue }) => {
  const { webhookEventId } = payloadOf(z.object({ webhookEventId: z.uuid() }), job.payload);
  const { data: event } = await admin
    .from("webhook_events")
    .select("id, topic, resource, marketplace_account_id, organization_id")
    .eq("id", webhookEventId)
    .maybeSingle();
  if (!event) throw new JobError("Evento não encontrado.", false, "event_missing");
  if (!event.marketplace_account_id) {
    await markEvent(admin, event.id, "ignored", "Nenhuma conta conectada corresponde ao user_id da notificação.");
    return { ignored: true };
  }
  try {
    const account = await loadAccount(admin, event.marketplace_account_id);
    let result: Record<string, unknown> = {};
    const order = ORDER_RESOURCE.exec(event.resource);
    const item = ITEM_RESOURCE.exec(event.resource);
    const shipment = SHIPMENT_RESOURCE.exec(event.resource);
    if ((event.topic === "orders_v2" || event.topic === "orders") && order) {
      const mlOrder = await mlClientForAccount(account.id, account.site_id).getOrder(order[1]);
      result = await ingestOrder(admin, enqueue, account, mlOrder);
    } else if (event.topic === "items" && item) {
      result = await refreshListing(admin, account.id, account.site_id, item[1]);
    } else if (event.topic === "shipments" && shipment) {
      const data = await mlClientForAccount(account.id, account.site_id).getShipment(shipment[1]);
      const { data: localOrder } = await admin
        .from("orders")
        .select("id, metadata, fulfillment_status")
        .eq("marketplace_account_id", account.id)
        .eq("external_shipment_id", data.id)
        .maybeSingle();
      if (localOrder) {
        const fulfillment =
          data.status === "delivered" ? "delivered" : data.status === "shipped" && ["forwarded", "awaiting_supplier"].includes(localOrder.fulfillment_status) ? "shipped" : localOrder.fulfillment_status;
        await admin
          .from("orders")
          .update({
            fulfillment_status: fulfillment,
            metadata: asJson({ ...(localOrder.metadata as object), shipping_status: data.status, shipping_substatus: data.substatus ?? null, tracking_number: data.tracking_number ?? null }),
          })
          .eq("id", localOrder.id);
      }
      result = { shipment: data.id, status: data.status, matched: Boolean(localOrder) };
    } else {
      await markEvent(admin, event.id, "ignored", "Tópico ou recurso não tratado.");
      return { ignored: true };
    }
    await markEvent(admin, event.id, "processed");
    return result;
  } catch (error) {
    await markEvent(admin, event.id, "failed", error instanceof Error ? error.message.slice(0, 500) : "erro");
    throw error;
  }
};

const orderSync: JobHandler = async (job, { admin, enqueue }) => {
  const { accountId, orderId } = payloadOf(z.object({ accountId: z.uuid(), orderId: z.string().regex(/^\d{1,20}$/) }), job.payload);
  const account = await loadAccount(admin, accountId);
  const order = await mlClientForAccount(account.id, account.site_id).getOrder(orderId);
  return ingestOrder(admin, enqueue, account, order);
};

/** Recupera vendas cujas notificações possam ter sido perdidas. */
const ordersPoll: JobHandler = async (job, { admin, enqueue }) => {
  const { accountId } = payloadOf(z.object({ accountId: z.uuid() }), job.payload);
  const account = await loadAccount(admin, accountId);
  const orders = await mlClientForAccount(account.id, account.site_id).searchRecentOrders(account.external_account_id, 50);
  let created = 0;
  for (const order of orders) {
    const result = await ingestOrder(admin, enqueue, account, order);
    if (result.created) created++;
  }
  await admin.from("marketplace_accounts").update({ last_synced_at: new Date().toISOString(), last_error: null }).eq("id", account.id);
  return { fetched: orders.length, created };
};

/**
 * Ajusta o estoque do anúncio ao estoque do fornecedor. Sem estoque ou oferta inativa: pausa o anúncio.
 * Reativa apenas anúncios que a própria sincronização pausou.
 */
const listingStockSync: JobHandler = async (job, { admin }) => {
  const { listingId } = payloadOf(z.object({ listingId: z.uuid() }), job.payload);
  const { data: listing } = await admin
    .from("marketplace_listings")
    .select("id, external_item_id, status, available_stock, auto_sync_stock, paused_by_sync, version, account:marketplace_accounts(id, site_id, status), offer:supplier_offers(available_stock, status)")
    .eq("id", listingId)
    .maybeSingle();
  if (!listing || !listing.account) throw new JobError("Anúncio não encontrado.", false, "listing_missing");
  if (!listing.auto_sync_stock) return { skipped: "sincronização automática desligada" };
  if (listing.account.status !== "active") throw new JobError("Conta do Mercado Livre não está ativa.", false, "account_inactive");
  if (!["active", "paused"].includes(listing.status)) return { skipped: `status ${listing.status}` };

  const offerAvailable = listing.offer && listing.offer.status === "active" ? listing.offer.available_stock : 0;
  const client = mlClientForAccount(listing.account.id, listing.account.site_id);
  let patch: { available_quantity?: number; status?: "active" | "paused" } | null = null;
  let pausedBySync = listing.paused_by_sync;

  if (offerAvailable <= 0) {
    if (listing.status === "active") {
      patch = { status: "paused" };
      pausedBySync = true;
    }
  } else {
    patch = {};
    if (listing.available_stock !== offerAvailable) patch.available_quantity = offerAvailable;
    if (listing.status === "paused" && listing.paused_by_sync) {
      patch.status = "active";
      pausedBySync = false;
    }
    if (Object.keys(patch).length === 0) patch = null;
  }
  if (!patch) return { unchanged: true };

  try {
    const item = await client.updateItem(listing.external_item_id, patch);
    // Grava somente se ninguém alterou o registro no meio (controle otimista).
    await admin
      .from("marketplace_listings")
      .update({ status: item.status, available_stock: item.available_quantity ?? null, paused_by_sync: pausedBySync, last_synced_at: new Date().toISOString(), last_sync_error: null })
      .eq("id", listing.id)
      .eq("version", listing.version);
    return { patch, status: item.status };
  } catch (error) {
    const message = error instanceof MlApiError ? `Mercado Livre ${error.status}: ${error.message}` : "Falha ao atualizar estoque.";
    await admin.from("marketplace_listings").update({ last_sync_error: message }).eq("id", listing.id);
    throw error;
  }
};

/** Agenda sincronização para anúncios cujo estoque diverge da oferta do fornecedor. */
const listingsReconcile: JobHandler = async (_job, { admin, enqueue }) => {
  const { data } = await admin
    .from("marketplace_listings")
    .select("id, organization_id, status, available_stock, paused_by_sync, offer:supplier_offers(available_stock, status)")
    .eq("auto_sync_stock", true)
    .in("status", ["active", "paused"])
    .limit(1000);
  let scheduled = 0;
  for (const l of data ?? []) {
    const available = l.offer && l.offer.status === "active" ? l.offer.available_stock : 0;
    const diverges = (available <= 0 && l.status === "active") || (available > 0 && (l.available_stock !== available || (l.status === "paused" && l.paused_by_sync)));
    if (!diverges) continue;
    await enqueue({ organizationId: l.organization_id, jobType: "listing.stock_sync", payload: { listingId: l.id }, dedupKey: `listing:stock:${l.id}` });
    scheduled++;
  }
  return { scheduled };
};

/** Registra o consumo do mês de cada empresa ativa em usage_records (histórico para cobrança e suporte). */
const usageSnapshot: JobHandler = async (_job, { admin }) => {
  const now = new Date();
  const periodStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const periodEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  const { data: orgs } = await admin.from("organizations").select("id").eq("status", "active").limit(5000);
  let written = 0;
  for (const org of orgs ?? []) {
    const usage = await getUsage(admin, org.id);
    const rows = Object.entries(usage).map(([metric, quantity]) => ({
      organization_id: org.id,
      metric: metric.replace(/^max_/, ""),
      quantity,
      period_start: periodStart.toISOString(),
      period_end: periodEnd.toISOString(),
      metadata: { captured_at: now.toISOString() },
    }));
    const { error } = await admin.from("usage_records").upsert(rows, { onConflict: "organization_id,metric,period_start" });
    if (error) throw error;
    written += rows.length;
  }
  return { organizations: orgs?.length ?? 0, written };
};

export const jobHandlers: Record<string, JobHandler> = {
  "billing.usage_snapshot": usageSnapshot,
  "ml.notification": notification,
  "ml.order.sync": orderSync,
  "ml.orders.poll": ordersPoll,
  "listing.stock_sync": listingStockSync,
  "listings.reconcile": listingsReconcile,
};
