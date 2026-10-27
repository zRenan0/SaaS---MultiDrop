import "server-only";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { serverEnv, supabaseSecretKey } from "@/lib/env";

/**
 * Cliente com service role: ignora RLS. Uso restrito a processos do sistema
 * (webhooks, fila, OAuth, cobrança, painel do operador) SEMPRE após autorização explícita no código.
 * Nunca importe este módulo em componentes cliente.
 */
export function createAdminClient() {
  const env = serverEnv();
  return createClient<Database>(env.NEXT_PUBLIC_SUPABASE_URL, supabaseSecretKey(), {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

export type AdminSupabaseClient = ReturnType<typeof createAdminClient>;
