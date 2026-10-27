import "server-only";
import { headers } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";
import { logger } from "@/lib/logging/logger";
import { sha256Hex } from "@/lib/security/crypto";
import { isProduction } from "@/lib/env";

export async function clientIp(): Promise<string> {
  const h = await headers();
  return h.get("x-real-ip") ?? h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
}

/**
 * Retorna true se a requisição está dentro do limite. Chaves são armazenadas como hash
 * (não guardamos IP/e-mail em claro). Sem service role configurada, permite e registra aviso.
 */
export async function checkRateLimit(scope: string, identifier: string, limit: number, windowSeconds: number): Promise<boolean> {
  if (!process.env.SUPABASE_SECRET_KEY) {
    logger.warn("rate_limit_unavailable", { scope });
    return true;
  }
  try {
    const admin = createAdminClient();
    const { data, error } = await admin.rpc("rate_limit_hit", {
      p_key: `${scope}:${sha256Hex(identifier).slice(0, 32)}`,
      // Fora de produção os limites são ampliados para não bloquear desenvolvimento e testes automatizados.
      p_limit: isProduction() ? limit : limit * 50,
      p_window_seconds: windowSeconds,
    });
    if (error) throw error;
    return data === true;
  } catch (error) {
    logger.error("rate_limit_check_failed", { scope, error });
    return true;
  }
}
