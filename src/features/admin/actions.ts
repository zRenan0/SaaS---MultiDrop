"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { formDataToObject, parseInput, runAction } from "@/server/action";
import { adminAudit } from "@/server/audit";
import type { ActionResult } from "@/server/errors";
import { requirePlatformAdmin } from "@/features/admin/guard";

export async function setOrganizationStatusAction(formData: FormData): Promise<ActionResult> {
  return runAction("admin.org_status", async () => {
    const user = await requirePlatformAdmin();
    const input = parseInput(z.object({ organizationId: z.uuid(), status: z.enum(["active", "suspended"]), reason: z.string().trim().min(3, "Informe o motivo.").max(500) }), formDataToObject(formData));
    const admin = createAdminClient();
    const { data, error } = await admin.from("organizations").update({ status: input.status }).eq("id", input.organizationId).neq("status", "deleted").select("id, name");
    if (error || !data?.length) return { ok: false, error: "Empresa não encontrada." };
    await adminAudit({ actorUserId: user.id, action: `organization.${input.status === "active" ? "reactivate" : "suspend"}`, entityType: "organization", entityId: input.organizationId, metadata: { reason: input.reason } });
    revalidatePath("/admin/organizations");
    return { ok: true, message: input.status === "active" ? "Empresa reativada." : "Empresa suspensa: os membros perdem o acesso imediatamente." };
  });
}

/** Plano concedido manualmente (cortesia, uso interno). Não é cobrança: altera a assinatura interna padrão. */
export async function assignInternalPlanAction(formData: FormData): Promise<ActionResult> {
  return runAction("admin.assign_plan", async () => {
    const user = await requirePlatformAdmin();
    const input = parseInput(z.object({ organizationId: z.uuid(), planCode: z.string().regex(/^[a-z0-9_]{2,40}$/) }), formDataToObject(formData));
    const admin = createAdminClient();
    const { data: plan } = await admin.from("plans").select("code").eq("code", input.planCode).maybeSingle();
    if (!plan) return { ok: false, error: "Plano inexistente." };
    const { data: existing } = await admin.from("subscriptions").select("id").eq("organization_id", input.organizationId).eq("provider", "internal").order("created_at").limit(1).maybeSingle();
    const { error } = existing
      ? await admin.from("subscriptions").update({ plan_code: input.planCode, status: "active", current_period_end: null }).eq("id", existing.id)
      : await admin.from("subscriptions").insert({ organization_id: input.organizationId, provider: "internal", plan_code: input.planCode, status: "active", current_period_start: new Date().toISOString() });
    if (error) return { ok: false, error: "Não foi possível alterar o plano." };
    await adminAudit({ actorUserId: user.id, action: "organization.assign_internal_plan", entityType: "organization", entityId: input.organizationId, metadata: { planCode: input.planCode } });
    revalidatePath("/admin/organizations");
    return { ok: true, message: "Plano interno atualizado (sem cobrança)." };
  });
}

export async function adminRetryJobAction(formData: FormData): Promise<ActionResult> {
  return runAction("admin.retry_job", async () => {
    const user = await requirePlatformAdmin();
    const jobId = parseInput(z.uuid(), formData.get("jobId"));
    const { data, error } = await createAdminClient().rpc("retry_sync_job", { p_job_id: jobId });
    if (error || !data) return { ok: false, error: "Tarefa não pode ser reprocessada." };
    await adminAudit({ actorUserId: user.id, action: "job.retry", entityType: "sync_job", entityId: jobId });
    revalidatePath("/admin");
    return { ok: true, message: "Tarefa reagendada." };
  });
}
