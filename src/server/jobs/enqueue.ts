import "server-only";
import type { AdminSupabaseClient } from "@/lib/supabase/admin";
import { asJson } from "@/lib/db-values";
import type { EnqueueFn } from "@/server/jobs/types";

export function createEnqueue(admin: AdminSupabaseClient): EnqueueFn {
  return async ({ organizationId, jobType, payload = {}, dedupKey, delaySeconds = 0, priority = 100, maxAttempts = 8 }) => {
    const { data, error } = await admin.rpc("enqueue_sync_job", {
      p_organization_id: organizationId as string,
      p_job_type: jobType,
      p_payload: asJson(payload),
      p_deduplication_key: dedupKey as string,
      p_available_at: new Date(Date.now() + delaySeconds * 1000).toISOString(),
      p_priority: priority,
      p_max_attempts: maxAttempts,
    });
    if (error) throw error;
    return data;
  };
}
