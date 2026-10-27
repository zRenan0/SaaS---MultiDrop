import "server-only";
import { randomUUID } from "node:crypto";
import type { AdminSupabaseClient } from "@/lib/supabase/admin";
import { asJson } from "@/lib/db-values";
import { logger, redactText } from "@/lib/logging/logger";
import { createEnqueue } from "@/server/jobs/enqueue";
import { JobError, retryDelaySeconds, type JobHandler, type JobRecord } from "@/server/jobs/types";
import { MlApiError } from "@/server/integrations/mercado-livre/http";
import { ReauthorizationRequiredError } from "@/server/integrations/mercado-livre/token-manager";

export type RunSummary = { workerId: string; claimed: number; succeeded: number; retried: number; dead: number; durationMs: number };

function classify(error: unknown): { retryable: boolean; code: string; message: string } {
  if (error instanceof JobError) return { retryable: error.retryable, code: error.code, message: error.message };
  if (error instanceof ReauthorizationRequiredError) return { retryable: false, code: "reauthorization_required", message: error.message };
  if (error instanceof MlApiError) {
    return { retryable: error.retryable || error.status === 0, code: error.code, message: `Mercado Livre ${error.status}: ${error.message}` };
  }
  return { retryable: true, code: "unexpected", message: error instanceof Error ? redactText(error.message) : "erro desconhecido" };
}

/**
 * Executa tarefas pendentes dentro de um orçamento de tempo. O estado vive no banco (lease, tentativas),
 * nunca na memória da função: se a execução for interrompida, o lease expira e outra execução retoma.
 */
export async function runJobs(
  admin: AdminSupabaseClient,
  handlers: Record<string, JobHandler>,
  options: { batchSize?: number; timeBudgetMs?: number; leaseSeconds?: number } = {},
): Promise<RunSummary> {
  const started = Date.now();
  const workerId = `worker-${randomUUID().slice(0, 8)}`;
  const budget = options.timeBudgetMs ?? 45_000;
  const summary: RunSummary = { workerId, claimed: 0, succeeded: 0, retried: 0, dead: 0, durationMs: 0 };
  const enqueue = createEnqueue(admin);

  while (Date.now() - started < budget) {
    const { data: jobs, error } = await admin.rpc("claim_sync_jobs", {
      p_worker: workerId,
      p_batch: options.batchSize ?? 10,
      p_lease_seconds: options.leaseSeconds ?? 300,
    });
    if (error) throw error;
    if (!jobs || jobs.length === 0) break;
    summary.claimed += jobs.length;

    for (const job of jobs as JobRecord[]) {
      const handler = handlers[job.job_type];
      try {
        if (!handler) throw new JobError(`Tipo de tarefa desconhecido: ${job.job_type}`, false, "unknown_job_type");
        const result = await handler(job, { admin, workerId, enqueue });
        await admin.rpc("complete_sync_job", { p_job_id: job.id, p_worker: workerId, p_result: asJson(result ?? {}) });
        summary.succeeded++;
      } catch (error) {
        const info = classify(error);
        const { data: status } = await admin.rpc("fail_sync_job", {
          p_job_id: job.id,
          p_worker: workerId,
          p_error: `${info.code}: ${info.message}`,
          p_retryable: info.retryable,
          p_backoff_seconds: retryDelaySeconds(job.attempts),
        });
        if (status === "dead") {
          summary.dead++;
          await admin.from("integration_errors").insert({
            organization_id: job.organization_id,
            integration_type: job.job_type.split(".")[0] === "ml" ? "mercado_livre" : "jobs",
            entity_type: "sync_job",
            entity_id: job.id,
            error_code: info.code,
            message: `Tarefa ${job.job_type} falhou definitivamente após ${job.attempts} tentativa(s): ${info.message}`.slice(0, 2000),
            retryable: info.retryable,
          });
        } else {
          summary.retried++;
        }
        logger.warn("job_failed", { jobId: job.id, jobType: job.job_type, attempt: job.attempts, status, errorCode: info.code, detail: info.message });
      }
      // Todas as tarefas reservadas no lote são processadas (lotes pequenos); o orçamento é checado entre lotes.
    }
  }
  summary.durationMs = Date.now() - started;
  return summary;
}
