import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { safeNextPath } from "@/features/auth/schemas";

/** Troca o código de confirmação/recuperação do Supabase Auth por uma sessão. */
export async function GET(request: NextRequest) {
  const url = request.nextUrl;
  const code = url.searchParams.get("code");
  const next = safeNextPath(url.searchParams.get("next"));
  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL(next, url.origin));
    // Link aberto em outro navegador (ex.: app de e-mail): o Supabase já confirmou o e-mail antes de redirecionar,
    // mas sem o code verifier deste navegador não há sessão. Na confirmação de cadastro basta entrar com a senha.
    if (error.code === "pkce_code_verifier_not_found" && next !== "/reset-password") {
      return NextResponse.redirect(new URL("/login?error=outro_navegador", url.origin));
    }
  }
  return NextResponse.redirect(new URL("/login?error=link_invalido", url.origin));
}
