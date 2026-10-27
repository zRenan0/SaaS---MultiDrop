import type { Metadata } from "next";
import Link from "next/link";
import { CreateOrganizationForm } from "@/features/organizations/components";
import { getOrgContext } from "@/server/session";

export const metadata: Metadata = { title: "Criar empresa" };

export default async function OnboardingPage() {
  const ctx = await getOrgContext();
  return (
    <div className="flex min-h-svh items-center justify-center bg-muted/40 px-4 py-10">
      <div className="w-full max-w-md space-y-4">
        <CreateOrganizationForm />
        <p className="text-center text-sm text-muted-foreground">
          Recebeu um convite? Abra o link enviado pelo administrador da empresa.
          {ctx ? (
            <>
              {" "}
              <Link href="/app" className="text-primary hover:underline">Voltar ao painel</Link>
            </>
          ) : null}
        </p>
      </div>
    </div>
  );
}
