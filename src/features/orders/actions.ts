"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { numeric } from "@/lib/db-values";
import { parseBrlAmount } from "@/lib/money";
import { isSafePublicUrl } from "@/features/catalog/normalize";
import { formDataToObject, parseInput, runAction } from "@/server/action";
import { audit } from "@/server/audit";
import { describeDbError, type ActionResult } from "@/server/errors";
import { requirePermission } from "@/server/session";
import { createEnqueue } from "@/server/jobs/enqueue";
import { runJobs } from "@/server/jobs/runner";
import { jobHandlers } from "@/server/jobs/handlers";
import { fulfillmentFromPurchaseOrder, PO_TRANSITIONS, type PurchaseOrderStatus } from "@/features/orders/status";

export async function createPurchaseOrderAction(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  return runAction("orders.create_po", async (): Promise<ActionResult> => {
    const ctx = await requirePermission("orders.forward");
    const input = parseInput(
      z.object({ orderId: z.uuid(), supplierConnectionId: z.uuid("Selecione o fornecedor."), totalCost: z.string().optional(), notes: z.string().max(2000).optional() }),
      formDataToObject(formData),
    );
    const cost = input.totalCost ? parseBrlAmount(input.totalCost) : null;
    if (input.totalCost && (!cost || cost.isNegative())) return { ok: false, error: "Custo inválido.", fieldErrors: { totalCost: ["Custo inválido."] } };
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("supplier_purchase_orders")
      .insert({
        organization_id: ctx.organization.id,
        order_id: input.orderId,
        supplier_connection_id: input.supplierConnectionId,
        submission_method: "manual",
        total_cost: cost ? numeric(cost.toFixed(2)) : null,
        notes: input.notes || null,
      })
      .select("id")
      .single();
    if (error) {
      if (error.code === "23505") return { ok: false, error: "Já existe um pedido de compra em andamento para este fornecedor." };
      return { ok: false, error: describeDbError(error) };
    }
    await audit({ organizationId: ctx.organization.id, actorUserId: ctx.user.id, action: "purchase_order.create", entityType: "supplier_purchase_order", entityId: data.id, metadata: { order_id: input.orderId } });
    revalidatePath(`/app/orders/${input.orderId}`);
    return { ok: true, message: "Pedido de compra registrado. Envie ao fornecedor e marque como enviado." };
  });
}

export async function updatePurchaseOrderStatusAction(formData: FormData): Promise<ActionResult> {
  return runAction("orders.update_po", async () => {
    const ctx = await requirePermission("orders.forward");
    const input = parseInput(
      z.object({
        purchaseOrderId: z.uuid(),
        status: z.enum(["submitted", "accepted", "rejected", "shipped", "delivered", "canceled", "draft"]),
        externalPurchaseOrderId: z.string().trim().max(120).optional(),
      }),
      formDataToObject(formData),
    );
    const supabase = await createClient();
    const { data: po } = await supabase
      .from("supplier_purchase_orders")
      .select("id, status, order_id, version")
      .eq("id", input.purchaseOrderId)
      .eq("organization_id", ctx.organization.id)
      .maybeSingle();
    if (!po) return { ok: false, error: "Pedido de compra não encontrado." };
    if (!PO_TRANSITIONS[po.status as PurchaseOrderStatus].includes(input.status)) {
      return { ok: false, error: "Transição de status não permitida." };
    }
    const { data, error } = await supabase
      .from("supplier_purchase_orders")
      .update({ status: input.status, ...(input.externalPurchaseOrderId ? { external_purchase_order_id: input.externalPurchaseOrderId } : {}) })
      .eq("id", po.id)
      .eq("version", po.version)
      .select("id");
    if (error) return { ok: false, error: describeDbError(error) };
    if (!data?.length) return { ok: false, error: "O pedido de compra foi alterado por outra pessoa. Recarregue a página." };

    const fulfillment = fulfillmentFromPurchaseOrder(input.status);
    if (fulfillment) await supabase.from("orders").update({ fulfillment_status: fulfillment }).eq("id", po.order_id).eq("organization_id", ctx.organization.id);
    await audit({ organizationId: ctx.organization.id, actorUserId: ctx.user.id, action: `purchase_order.${input.status}`, entityType: "supplier_purchase_order", entityId: po.id });
    revalidatePath(`/app/orders/${po.order_id}`);
    revalidatePath("/app/orders");
    return { ok: true, message: "Status atualizado." };
  });
}

export async function addShipmentAction(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  return runAction("orders.add_shipment", async (): Promise<ActionResult> => {
    const ctx = await requirePermission("orders.forward");
    const input = parseInput(
      z.object({
        purchaseOrderId: z.uuid(),
        orderId: z.uuid(),
        carrier: z.string().trim().max(80).optional(),
        trackingCode: z.string().trim().min(3, "Informe o código de rastreio.").max(80),
        trackingUrl: z.string().trim().optional(),
      }),
      formDataToObject(formData),
    );
    if (input.trackingUrl && !isSafePublicUrl(input.trackingUrl)) return { ok: false, error: "URL de rastreio deve ser https pública.", fieldErrors: { trackingUrl: ["URL inválida."] } };
    const supabase = await createClient();
    const { error } = await supabase.from("shipments").insert({
      organization_id: ctx.organization.id,
      supplier_purchase_order_id: input.purchaseOrderId,
      carrier: input.carrier || null,
      tracking_code: input.trackingCode,
      tracking_url: input.trackingUrl || null,
      status: "dispatched",
      dispatched_at: new Date().toISOString(),
    });
    if (error) return { ok: false, error: describeDbError(error) };
    revalidatePath(`/app/orders/${input.orderId}`);
    return { ok: true, message: "Rastreio registrado." };
  });
}

/** Reconsulta o pedido na API oficial (via fila) e processa imediatamente. */
export async function syncOrderAction(formData: FormData): Promise<ActionResult> {
  return runAction("orders.sync", async () => {
    const ctx = await requirePermission("orders.forward");
    const orderId = parseInput(z.uuid(), formData.get("orderId"));
    const supabase = await createClient();
    const { data: order } = await supabase.from("orders").select("id, external_order_id, marketplace_account_id").eq("id", orderId).eq("organization_id", ctx.organization.id).maybeSingle();
    if (!order) return { ok: false, error: "Pedido não encontrado." };
    const admin = createAdminClient();
    await createEnqueue(admin)({
      organizationId: ctx.organization.id,
      jobType: "ml.order.sync",
      payload: { accountId: order.marketplace_account_id, orderId: order.external_order_id },
      dedupKey: `ml:order:${order.marketplace_account_id}:${order.external_order_id}`,
      priority: 5,
    });
    await runJobs(admin, jobHandlers, { batchSize: 5, timeBudgetMs: 10_000 });
    revalidatePath(`/app/orders/${order.id}`);
    return { ok: true, message: "Consulta ao Mercado Livre solicitada. Se não atualizar, veja Operações e erros." };
  });
}

/** Busca vendas recentes da conta (recupera notificações perdidas). */
export async function pollOrdersAction(formData: FormData): Promise<ActionResult> {
  return runAction("orders.poll", async () => {
    const ctx = await requirePermission("orders.forward");
    const accountId = parseInput(z.uuid(), formData.get("accountId"));
    const supabase = await createClient();
    const { data: account } = await supabase.from("marketplace_accounts").select("id, status").eq("id", accountId).eq("organization_id", ctx.organization.id).maybeSingle();
    if (!account || account.status !== "active") return { ok: false, error: "Conta não encontrada ou inativa." };
    const admin = createAdminClient();
    await createEnqueue(admin)({ organizationId: ctx.organization.id, jobType: "ml.orders.poll", payload: { accountId: account.id }, dedupKey: `manual:orders.poll:${account.id}`, priority: 5, maxAttempts: 3 });
    const summary = await runJobs(admin, jobHandlers, { batchSize: 5, timeBudgetMs: 20_000 });
    revalidatePath("/app/orders");
    return { ok: true, message: `Busca concluída (${summary.succeeded} tarefa(s) processada(s)).` };
  });
}
