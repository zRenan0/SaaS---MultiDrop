import type { AdminSupabaseClient } from "@/lib/supabase/admin";
import type { Json } from "@/types/database";

export type JobRecord = {
  id: string;
  organization_id: string | null;
  job_type: string;
  attempts: number;
  max_attempts: number;
  payload: Json;
};

export type JobContext = { admin: AdminSupabaseClient; workerId: string; enqueue: EnqueueFn };

export type JobResult = Record<string, unknown> | null;

export type JobHandler = (job: JobRecord, ctx: JobContext) => Promise<JobResult>;

export type EnqueueFn = (input: {
  organizationId: string | null;
  jobType: string;
  payload?: Record<string, unknown>;
  dedupKey?: string;
  delaySeconds?: number;
  priority?: number;
  maxAttempts?: number;
}) => Promise<string | null>;

/** Erro de tarefa com classificação explícita: permanente não é repetido. */
export class JobError extends Error {
  constructor(
    message: string,
    public readonly retryable: boolean,
    public readonly code = retryable ? "temporary" : "permanent",
  ) {
    super(message);
    this.name = "JobError";
  }
}

/** Backoff exponencial com teto: 30 s, 60 s, 120 s ... até 1 h. */
export function retryDelaySeconds(attempt: number): number {
  return Math.min(30 * 2 ** Math.max(0, attempt - 1), 3600);
}
