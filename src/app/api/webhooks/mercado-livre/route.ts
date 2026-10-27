import { after, NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkRateLimit } from "@/lib/security/rate-limit";
import { logger } from "@/lib/logging/logger";
import { receiveNotification } from "@/features/marketplace/webhook";
import { runJobs } from "@/server/jobs/runner";
import { jobHandlers } from "@/server/jobs/handlers";

const MAX_BODY_BYTES = 10_000;

/** Rota pública de notificações do Mercado Livre. Responde rápido; o processamento ocorre na fila. */
export async function POST(request: NextRequest) {
  const ip = request.headers.get("x-real-ip") ?? request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  if (!(await checkRateLimit("ml_webhook", ip, 1200, 60))) return NextResponse.json({ error: "rate_limited" }, { status: 429 });

  const text = await request.text();
  if (text.length > MAX_BODY_BYTES) return NextResponse.json({ error: "payload_too_large" }, { status: 413 });
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  try {
    const admin = createAdminClient();
    const outcome = await receiveNotification(admin, body, process.env.ML_CLIENT_ID ?? null);
    if (outcome.result === "queued") {
      // Processamento oportunista após responder; a execução agendada (cron) garante a conclusão.
      after(async () => {
        try {
          await runJobs(createAdminClient(), jobHandlers, { batchSize: 5, timeBudgetMs: 8_000 });
        } catch (error) {
          logger.error("webhook_after_run_failed", { error });
        }
      });
    }
    return NextResponse.json({ result: outcome.result }, { status: outcome.status });
  } catch (error) {
    logger.error("ml_webhook_failed", { error });
    // 500 faz o Mercado Livre reenviar a notificação.
    return NextResponse.json({ error: "temporary_failure" }, { status: 500 });
  }
}
