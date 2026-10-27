import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { logger } from "@/lib/logging/logger";
import { redact } from "@/lib/logging/logger";
import { asJson } from "@/lib/db-values";

type AuditInput = {
  organizationId: string;
  actorUserId: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  metadata?: Record<string, unknown>;
  requestId?: string;
};

/** Registra ação sensível. Falha na auditoria é logada, mas não interrompe a operação já concluída. */
export async function audit(input: AuditInput): Promise<void> {
  try {
    const admin = createAdminClient();
    const { error } = await admin.from("audit_logs").insert({
      organization_id: input.organizationId,
      actor_user_id: input.actorUserId,
      action: input.action,
      entity_type: input.entityType,
      entity_id: input.entityId ?? null,
      request_id: input.requestId ?? null,
      metadata: asJson(redact(input.metadata ?? {})),
    });
    if (error) throw error;
  } catch (error) {
    logger.error("audit_write_failed", { action: input.action, error });
  }
}

export async function adminAudit(input: Omit<AuditInput, "organizationId" | "requestId">): Promise<void> {
  try {
    const admin = createAdminClient();
    const { error } = await admin.from("admin_audit_logs").insert({
      actor_user_id: input.actorUserId,
      action: input.action,
      entity_type: input.entityType,
      entity_id: input.entityId ?? null,
      metadata: asJson(redact(input.metadata ?? {})),
    });
    if (error) throw error;
  } catch (error) {
    logger.error("admin_audit_write_failed", { action: input.action, error });
  }
}
