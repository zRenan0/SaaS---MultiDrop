import "server-only";
import type { AdminSupabaseClient } from "@/lib/supabase/admin";
import { asJson } from "@/lib/db-values";
import type { MlOrder } from "@/server/integrations/mercado-livre/schemas";
import type { EnqueueFn } from "@/server/jobs/types";
import { JobError } from "@/server/jobs/types";

export type IngestResult = { orderId: string; created: boolean; fulfillment: string; problems: string[] };

export async function loadAccount(admin: AdminSupabaseClient, accountId: string) {
  const { data } = await admin
    .from("marketplace_accounts")
    .select("id, organization_id, external_account_id, site_id, status")
    .eq("id", accountId)
    .maybeSingle();
  if (!data || data.status === "disconnected") throw new JobError("Conta do marketplace inexistente ou desconectada.", false, "account_unavailable");
  if (data.status !== "active") throw new JobError("Conta do Mercado Livre precisa ser autorizada novamente.", false, "account_inactive");
  return data;
}

/**
 * Grava o pedido consultado na API oficial (nunca a partir do conteúdo da notificação).
 * A função do banco valida que o pedido pertence ao vendedor da conta e é idempotente.
 */
export async function ingestOrder(
  admin: AdminSupabaseClient,
  enqueue: EnqueueFn,
  account: { id: string; organization_id: string },
  order: MlOrder,
): Promise<IngestResult> {
  const { data, error } = await admin.rpc("ingest_marketplace_order", { p_account_id: account.id, p_order: asJson(order) });
  if (error) {
    const permanent = error.code === "42501" || error.code === "22023" || error.code === "P0002";
    throw new JobError(`Falha ao gravar pedido ${order.id}: ${error.message}`, !permanent, error.code ?? "db_error");
  }
  const row = data?.[0];
  if (!row) throw new JobError("Ingestão sem retorno.", true);

  if (row.problems.length > 0 && row.created) {
    await admin.from("integration_errors").insert({
      organization_id: account.organization_id,
      integration_type: "mercado_livre",
      entity_type: "order",
      entity_id: row.order_id,
      error_code: "order_needs_attention",
      message: `Pedido ${order.id}: ${row.problems.join(" ")}`.slice(0, 2000),
      retryable: false,
    });
  }

  // Estoque do fornecedor mudou: atualiza os anúncios que usam as mesmas ofertas.
  const { data: items } = await admin.from("order_items").select("supplier_offer_id").eq("order_id", row.order_id).not("supplier_offer_id", "is", null);
  const offerIds = [...new Set((items ?? []).map((i) => i.supplier_offer_id as string))];
  if (offerIds.length > 0) {
    const { data: listings } = await admin
      .from("marketplace_listings")
      .select("id")
      .in("supplier_offer_id", offerIds)
      .eq("auto_sync_stock", true)
      .in("status", ["active", "paused"]);
    for (const listing of listings ?? []) {
      await enqueue({ organizationId: account.organization_id, jobType: "listing.stock_sync", payload: { listingId: listing.id }, dedupKey: `listing:stock:${listing.id}`, priority: 50 });
    }
  }
  return { orderId: row.order_id, created: row.created, fulfillment: row.fulfillment, problems: row.problems };
}
