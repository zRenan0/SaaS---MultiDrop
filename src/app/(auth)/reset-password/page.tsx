import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getUser } from "@/server/session";
import { ResetPasswordForm } from "@/features/auth/components/auth-forms";

export const metadata: Metadata = { title: "Nova senha" };

export default async function ResetPasswordPage() {
  // A sessão de recuperação é criada em /auth/callback a partir do link enviado por e-mail.
  if (!(await getUser())) redirect("/login?error=link_invalido");
  return <ResetPasswordForm />;
}
