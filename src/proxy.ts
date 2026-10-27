import type { NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/proxy";

export async function proxy(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  // Webhooks e tarefas agendadas não usam sessão de usuário.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api/webhooks|api/jobs|api/health|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
