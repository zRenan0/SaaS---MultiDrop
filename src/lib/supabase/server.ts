import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { Database } from "@/types/database";
import { serverEnv } from "@/lib/env";

/**
 * Cliente Supabase com a sessão do usuário (RLS aplicada).
 * Use em Server Components, Server Actions e Route Handlers.
 */
export async function createClient() {
  const env = serverEnv();
  const cookieStore = await cookies();
  return createServerClient<Database>(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Chamado a partir de um Server Component: a renovação da sessão é feita pelo proxy.
        }
      },
    },
  });
}

export type UserSupabaseClient = Awaited<ReturnType<typeof createClient>>;
