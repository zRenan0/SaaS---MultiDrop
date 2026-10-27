import { NextResponse, type NextRequest } from "next/server";
import { cronSecret } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";
import { safeEqual } from "@/lib/security/crypto";
import { logger } from "@/lib/logging/logger";
import { createEnqueue } from "@/server/jobs/enqueue";
import { jobHandlers } from "@/server/jobs/handlers";
import { runJobs } from "@/server/jobs/runner";

export const maxDuration = 60;

/** Executor agendado da fila (Vercel Cron envia "Authorization: Bearer <CRON_SECRET>"). */
export async function GET(request: NextRequest) {
  const secret = cronSecret();
  const header = request.headers.get("authorization") ?? "";
  if (!secret || !safeEqual(header, `Bearer ${secret}`)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const admin = createAdminClient();
  const enqueue = createEnqueue(admin);
  const now = Date.now();
  const tenMinutes = Math.floor(now / 600_000);
  const hour = Math.floor(now / 3_600_000);
  try {
    await enqueue({ organizationId: null, jobType: "listings.reconcile", dedupKey: `cron:listings.reconcile:${tenMinutes}`, maxAttempts: 2 });
    await enqueue({ organizationId: null, jobType: "billing.usage_snapshot", dedupKey: `cron:usage:${new Date(now).toISOString().slice(0, 10)}`, maxAttempts: 3, priority: 200 });
    const { data: accounts } = await admin.from("marketplace_accounts").select("id, organization_id").eq("status", "active");
    for (const account of accounts ?? []) {
      // Varredura horária respeitando limites da API; notificações cobrem o tempo real.
      await enqueue({ organizationId: account.organization_id, jobType: "ml.orders.poll", payload: { accountId: account.id }, dedupKey: `cron:orders.poll:${account.id}:${hour}`, maxAttempts: 3 });
    }
    const summary = await runJobs(admin, jobHandlers, { timeBudgetMs: 45_000 });
    return NextResponse.json(summary);
  } catch (error) {
    logger.error("jobs_run_failed", { error });
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}
