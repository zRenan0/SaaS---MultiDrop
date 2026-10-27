import { z } from "zod";

export const emailSchema = z.email("Informe um e-mail válido.").max(254).transform((v) => v.trim().toLowerCase());

export const passwordSchema = z
  .string()
  .min(10, "A senha deve ter pelo menos 10 caracteres.")
  .max(128, "A senha deve ter no máximo 128 caracteres.")
  .refine((v) => /[A-Za-z]/.test(v) && /[0-9]/.test(v), "Use letras e números.");

export const signInSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "Informe a senha.").max(128),
  next: z.string().optional(),
});

export const signUpSchema = z.object({
  fullName: z.string().trim().min(2, "Informe seu nome.").max(120),
  email: emailSchema,
  password: passwordSchema,
});

export const forgotPasswordSchema = z.object({ email: emailSchema });

export const resetPasswordSchema = z
  .object({ password: passwordSchema, confirm: z.string() })
  .refine((v) => v.password === v.confirm, { message: "As senhas não conferem.", path: ["confirm"] });

/** Aceita apenas caminhos internos para evitar open redirect. */
export function safeNextPath(next: string | null | undefined, fallback = "/app"): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.includes("\\")) return fallback;
  return next;
}
