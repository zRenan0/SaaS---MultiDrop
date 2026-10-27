"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseInput, runAction } from "@/server/action";
import { audit } from "@/server/audit";
import { describeDbError, type ActionResult } from "@/server/errors";
import { requirePermission } from "@/server/session";

export async function resolveIntegrationErrorAction(formData: FormData): Promise<ActionResult> {
  return runAction("operations.resolve_error", async () => {
    const ctx = await requirePermission("orders.forward");
    const id = parseInput(z.uuid(), formData.get("errorId"));
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("integration_errors")
      .update({ resolved_at: new Date().toISOString(), resolved_by: ctx.user.id })
      .eq("id", id)
      .eq("organization_id", ctx.organization.id)
      .select("id");
    if (error || !data?.length) return { ok: false, error: describeDbError(error, "Erro não encontrado.") };
    revalidatePath("/app/operations");
    return { ok: true, message: "Marcado como resolvido." };
  });
}

/** Reprocessa uma tarefa encerrada. A tarefa precisa pertencer à empresa (verificado via RLS antes de usar o service role). */
export async function retryJobAction(formData: FormData): Promise<ActionResult> {
  return runAction("operations.retry_job", async () => {
    const ctx = await requirePermission("operations.retry");
    const id = parseInput(z.uuid(), formData.get("jobId"));
    const supabase = await createClient();
    const { data: job } = await supabase.from("sync_jobs").select("id, status, job_type").eq("id", id).eq("organization_id", ctx.organization.id).maybeSingle();
    if (!job) return { ok: false, error: "Tarefa não encontrada." };
    if (!["dead", "failed"].includes(job.status)) return { ok: false, error: "Somente tarefas encerradas com falha podem ser reprocessadas." };
    const { data, error } = await createAdminClient().rpc("retry_sync_job", { p_job_id: job.id });
    if (error || !data) return { ok: false, error: "Não foi possível reagendar a tarefa." };
    await audit({ organizationId: ctx.organization.id, actorUserId: ctx.user.id, action: "job.retry", entityType: "sync_job", entityId: job.id, metadata: { job_type: job.job_type } });
    revalidatePath("/app/operations");
    return { ok: true, message: "Tarefa reagendada. Será processada na próxima execução da fila." };
  });
}
