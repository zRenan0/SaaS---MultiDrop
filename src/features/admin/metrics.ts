import "server-only";
import type { AdminSupabaseClient } from "@/lib/supabase/admin";

const head = { count: "exact" as const, head: true };

async function countBy<T extends string>(fn: (value: T) => PromiseLike<{ count: number | null }>, values: readonly T[]) {
  const results = await Promise.all(values.map((v) => fn(v)));
  return Object.fromEntries(values.map((v, i) => [v, results[i].count ?? 0])) as Record<T, number>;
}

/** Métricas operacionais reais (sem estimativas) para o painel do operador. */
export async function platformMetrics(admin: AdminSupabaseClient) {
  const since = new Date(Date.now() - 24 * 3600_000).toISOString();
  const [orgs, users, accounts, jobs24, pendingJobs, oldestPending, durations, webhooks24, openErrors, subs] = await Promise.all([
    countBy((s) => admin.from("organizations").select("id", head).eq("status", s), ["active", "suspended"] as const),
    admin.from("profiles").select("id", head),
    countBy((s) => admin.from("marketplace_accounts").select("id", head).eq("status", s), ["active", "reauthorization_required", "error", "disconnected"] as const),
    countBy((s) => admin.from("sync_jobs").select("id", head).eq("status", s).gte("created_at", since), ["succeeded", "pending", "running", "dead"] as const),
    admin.from("sync_jobs").select("id", head).eq("status", "pending").lte("available_at", new Date().toISOString()),
    admin.from("sync_jobs").select("available_at").eq("status", "pending").order("available_at").limit(1).maybeSingle(),
    admin.from("sync_jobs").select("duration_ms").eq("status", "succeeded").gte("finished_at", since).not("duration_ms", "is", null).limit(1000),
    countBy((s) => admin.from("webhook_events").select("id", head).eq("status", s).gte("received_at", since), ["processed", "queued", "ignored", "failed"] as const),
    admin.from("integration_errors").select("id", head).is("resolved_at", null),
    admin.from("subscriptions").select("plan_code, provider").in("status", ["active", "trialing"]),
  ]);
  const ds = (durations.data ?? []).map((d) => d.duration_ms as number).sort((a, b) => a - b);
  const subsByPlan: Record<string, number> = {};
  for (const s of subs.data ?? []) subsByPlan[`${s.plan_code} (${s.provider})`] = (subsByPlan[`${s.plan_code} (${s.provider})`] ?? 0) + 1;
  return {
    organizations: orgs,
    users: users.count ?? 0,
    accounts,
    jobs24h: jobs24,
    readyBacklog: pendingJobs.count ?? 0,
    oldestPendingAt: oldestPending.data?.available_at ?? null,
    jobDurationMs: ds.length ? { p50: ds[Math.floor(ds.length / 2)], p95: ds[Math.floor(ds.length * 0.95)] ?? ds[ds.length - 1], samples: ds.length } : null,
    webhooks24h: webhooks24,
    openErrors: openErrors.count ?? 0,
    subscriptionsByPlan: subsByPlan,
  };
}
