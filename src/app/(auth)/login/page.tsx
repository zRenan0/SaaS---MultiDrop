import type { Metadata } from "next";
import { SignInForm } from "@/features/auth/components/auth-forms";

export const metadata: Metadata = { title: "Entrar" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const params = await searchParams;
  const next = typeof params.next === "string" ? params.next : undefined;
  const notice =
    params.error === "link_invalido"
      ? "Link inválido ou expirado. Solicite um novo."
      : params.error === "outro_navegador"
        ? "Se você acabou de confirmar o e-mail, ele já está confirmado. Entre com seu e-mail e senha."
        : undefined;
  return <SignInForm next={next} notice={notice} />;
}
