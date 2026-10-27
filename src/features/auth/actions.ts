"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { checkRateLimit, clientIp } from "@/lib/security/rate-limit";
import { formDataToObject, parseInput, runAction } from "@/server/action";
import type { ActionResult } from "@/server/errors";
import { appConfig } from "@/lib/app-config";
import {
  forgotPasswordSchema,
  resetPasswordSchema,
  safeNextPath,
  signInSchema,
  signUpSchema,
} from "@/features/auth/schemas";

const TOO_MANY = "Muitas tentativas. Aguarde alguns minutos e tente novamente.";

export async function signInAction(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  let destination = "/app";
  const result = await runAction("auth.sign_in", async () => {
    const input = parseInput(signInSchema, formDataToObject(formData));
    const ip = await clientIp();
    if (!(await checkRateLimit("sign_in_ip", ip, 30, 600)) || !(await checkRateLimit("sign_in_email", input.email, 10, 600))) {
      return { ok: false, error: TOO_MANY };
    }
    const supabase = await createClient();
    const { error } = await supabase.auth.signInWithPassword({ email: input.email, password: input.password });
    if (error) {
      // Mensagem única para não revelar se o e-mail existe.
      return { ok: false, error: "E-mail ou senha inválidos, ou e-mail ainda não confirmado." };
    }
    destination = safeNextPath(input.next);
    return { ok: true };
  });
  if (result.ok) redirect(destination);
  return result;
}

export async function signUpAction(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  return runAction("auth.sign_up", async () => {
    const input = parseInput(signUpSchema, formDataToObject(formData));
    if (!(await checkRateLimit("sign_up_ip", await clientIp(), 10, 3600))) return { ok: false, error: TOO_MANY };
    const supabase = await createClient();
    const { data, error } = await supabase.auth.signUp({
      email: input.email,
      password: input.password,
      options: {
        data: { full_name: input.fullName },
        emailRedirectTo: `${appConfig.url}/auth/callback?next=/app`,
      },
    });
    if (error) {
      return { ok: false, error: error.code === "weak_password" ? "Senha fraca. Escolha outra." : "Não foi possível criar a conta. Verifique os dados." };
    }
    if (data.session) redirect("/app/onboarding");
    return { ok: true, message: "Conta criada. Enviamos um e-mail de confirmação; confirme para entrar." };
  });
}

export async function signOutAction(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

export async function forgotPasswordAction(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  return runAction("auth.forgot_password", async () => {
    const input = parseInput(forgotPasswordSchema, formDataToObject(formData));
    if (!(await checkRateLimit("forgot_password", `${await clientIp()}:${input.email}`, 5, 3600))) {
      return { ok: false, error: TOO_MANY };
    }
    const supabase = await createClient();
    await supabase.auth.resetPasswordForEmail(input.email, {
      redirectTo: `${appConfig.url}/auth/callback?next=/reset-password`,
    });
    // Resposta idêntica exista ou não a conta.
    return { ok: true, message: "Se houver uma conta com esse e-mail, você receberá um link para redefinir a senha." };
  });
}

export async function resetPasswordAction(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const result = await runAction("auth.reset_password", async () => {
    const input = parseInput(resetPasswordSchema, formDataToObject(formData));
    const supabase = await createClient();
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) return { ok: false, error: "Link expirado. Solicite uma nova redefinição de senha." };
    const { error } = await supabase.auth.updateUser({ password: input.password });
    if (error) return { ok: false, error: "Não foi possível alterar a senha. Tente outra senha." };
    return { ok: true };
  });
  if (result.ok) redirect("/app");
  return result;
}
