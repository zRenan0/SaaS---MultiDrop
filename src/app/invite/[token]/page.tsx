import type { Metadata } from "next";
import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AcceptInvitationForm } from "@/features/organizations/components";
import { getUser } from "@/server/session";

export const metadata: Metadata = { title: "Convite" };

export default async function InvitePage({ params }: PageProps<"/invite/[token]">) {
  const { token } = await params;
  const user = await getUser();
  return (
    <div className="flex min-h-svh items-center justify-center bg-muted/40 px-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Convite para empresa</CardTitle>
          <CardDescription>
            {user ? `Você está conectado como ${user.email}. O convite precisa ter sido enviado para este e-mail.` : "Entre ou crie uma conta com o e-mail convidado para aceitar."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {user ? (
            <AcceptInvitationForm token={token} />
          ) : (
            <div className="flex gap-2">
              <Button asChild>
                <Link href={`/login?next=/invite/${encodeURIComponent(token)}`}>Entrar</Link>
              </Button>
              <Button variant="outline" asChild>
                <Link href="/signup">Criar conta</Link>
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
