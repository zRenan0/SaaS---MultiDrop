import type { Metadata } from "next";
import { SignInForm } from "@/features/auth/components/auth-forms";

export const metadata: Metadata = { title: "Entrar" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const params = await searchParams;
  const next = typeof params.next === "string" ? params.next : undefined;
  const notice = params.error === "link_invalido" ? "Link inválido ou expirado. Solicite um novo." : undefined;
  return <SignInForm next={next} notice={notice} />;
}
