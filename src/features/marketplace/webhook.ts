import "server-only";
import type { AdminSupabaseClient } from "@/lib/supabase/admin";
import { asJson } from "@/lib/db-values";
import { sha256Hex } from "@/lib/security/crypto";
import { notificationSchema } from "@/server/integrations/mercado-livre/schemas";
import { createEnqueue } from "@/server/jobs/enqueue";

export const HANDLED_TOPICS = new Set(["orders_v2", "orders", "items", "shipments"]);

export type WebhookOutcome =
  | { status: 200; result: "queued" | "duplicate" | "ignored" }
  | { status: 400; result: "invalid" };

/**
 * Registra a notificação e agenda o processamento. Não confia no conteúdo: só guarda referência ao recurso,
 * que será consultado na API oficial com o token da conta correspondente.
 */
export async function receiveNotification(admin: AdminSupabaseClient, raw: unknown, expectedApplicationId: string | null): Promise<WebhookOutcome> {
  const parsed = notificationSchema.safeParse(raw);
  if (!parsed.success) return { status: 400, result: "invalid" };
  const n = parsed.data;
  if (expectedApplicationId && n.application_id !== expectedApplicationId) return { status: 400, result: "invalid" };

  const eventKey = n._id ? `ml:${n._id}` : `ml:${sha256Hex(`${n.topic}|${n.resource}|${n.user_id}|${n.sent ?? ""}`)}`;
  const { data: account } = await admin
    .from("marketplace_accounts")
    .select("id, organization_id")
    .eq("marketplace", "mercado_livre")
    .eq("external_account_id", n.user_id)
    .neq("status", "disconnected")
    .maybeSingle();

  const handled = HANDLED_TOPICS.has(n.topic) && Boolean(account);
  const { data: inserted, error } = await admin
    .from("webhook_events")
    .upsert(
      {
        marketplace: "mercado_livre",
        event_key: eventKey,
        resource: n.resource,
        topic: n.topic,
        external_user_id: n.user_id,
        application_id: n.application_id,
        organization_id: account?.organization_id ?? null,
        marketplace_account_id: account?.id ?? null,
        status: handled ? "queued" : "ignored",
        last_error: handled ? null : account ? "Tópico não tratado." : "Nenhuma conta conectada corresponde ao user_id.",
        metadata: asJson({ attempts_reported: n.attempts ?? null, sent: n.sent ?? null }),
      },
      { onConflict: "event_key", ignoreDuplicates: true },
    )
    .select("id");
  if (error) throw error;
  if (!inserted || inserted.length === 0) return { status: 200, result: "duplicate" };
  if (!handled || !account) return { status: 200, result: "ignored" };

  // Notificações repetidas do mesmo recurso são aglutinadas numa única tarefa pendente.
  await createEnqueue(admin)({
    organizationId: account.organization_id,
    jobType: "ml.notification",
    payload: { webhookEventId: inserted[0].id },
    dedupKey: `ml:notification:${account.id}:${n.resource}`,
    priority: n.topic.startsWith("orders") ? 10 : 50,
  });
  return { status: 200, result: "queued" };
}
