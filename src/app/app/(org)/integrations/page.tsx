import type { Metadata } from "next";
import { AlertTriangle, CheckCircle2, Plug } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/layout/states";
import { StatusBadge } from "@/components/ui/status-badge";
import { createClient } from "@/lib/supabase/server";
import { mercadoLivreConfigStatus } from "@/lib/env";
import { formatDateTime } from "@/lib/dates";
import { can } from "@/features/organizations/roles";
import { AccountActions, CreateTestUser } from "@/features/marketplace/components";
import { requireOrgContext } from "@/server/session";

export const metadata: Metadata = { title: "Mercado Livre" };

const ERRORS: Record<string, string> = {
  denied: "A autorização foi cancelada no Mercado Livre.",
  invalid_state: "Sessão de autorização inválida ou expirada. Inicie a conexão novamente neste navegador.",
  forbidden: "Somente administradores podem conectar contas.",
  exchange_failed: "O Mercado Livre recusou a troca do código de autorização. Confira ML_CLIENT_ID, ML_CLIENT_SECRET, ML_REDIRECT_URI e PKCE na aplicação.",
  account_in_use: "Esta conta do Mercado Livre já está conectada a outra empresa nesta plataforma.",
  plan_limit: "Limite de contas do plano atingido. Revise seu plano em Plano e uso.",
  user_mismatch: "O token recebido não corresponde ao usuário autorizado. Tente novamente.",
  not_configured: "Integração não configurada no servidor.",
  rate_limited: "Muitas tentativas. Aguarde alguns minutos.",
  unexpected: "Erro inesperado ao conectar. Consulte Operações e erros.",
};

const STATUS = {
  active: ["Conectada", "success"],
  reauthorization_required: ["Reautorização necessária", "warning"],
  disconnected: ["Desconectada", "neutral"],
  error: ["Com erro", "danger"],
} as const;

export default async function IntegrationsPage({ searchParams }: PageProps<"/app/integrations">) {
  const ctx = await requireOrgContext();
  const sp = await searchParams;
  const config = mercadoLivreConfigStatus();
  const supabase = await createClient();
  const { data: accounts } = await supabase
    .from("marketplace_accounts")
    .select("id, external_account_id, nickname, site_id, status, granted_scopes, user_product_seller, account_tags, last_synced_at, last_error, created_at")
    .eq("organization_id", ctx.organization.id)
    .order("created_at");
  const canConnect = can(ctx.role, "marketplace.connect");
  const error = typeof sp.error === "string" ? (ERRORS[sp.error] ?? ERRORS.unexpected) : null;

  return (
    <>
      <PageHeader
        title="Mercado Livre"
        description="Contas conectadas pela API oficial (OAuth). Os tokens ficam cifrados e nunca são exibidos."
        actions={
          canConnect && config.configured ? (
            <Button asChild>
              <a href="/api/integrations/mercado-livre/start">
                <Plug aria-hidden /> Conectar conta
              </a>
            </Button>
          ) : null
        }
      />
      <div className="grid gap-6">
        {sp.connected ? (
          <p role="status" className="flex items-center gap-2 rounded-lg border border-success/40 bg-success/10 p-3 text-sm">
            <CheckCircle2 className="size-4 text-success" aria-hidden /> Conta conectada com sucesso.
          </p>
        ) : null}
        {error ? (
          <p role="alert" className="flex items-center gap-2 rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm">
            <AlertTriangle className="size-4 text-destructive" aria-hidden /> {error}
          </p>
        ) : null}
        {!config.configured ? (
          <Card>
            <CardHeader>
              <CardTitle>Integração não configurada</CardTitle>
              <CardDescription>O operador da plataforma precisa definir as variáveis de ambiente abaixo e criar a aplicação no DevCenter do Mercado Livre.</CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="list-disc pl-5 font-mono text-sm">
                {config.missing.map((v) => <li key={v}>{v}</li>)}
              </ul>
            </CardContent>
          </Card>
        ) : null}
        {!accounts || accounts.length === 0 ? (
          <EmptyState icon={Plug} title="Nenhuma conta conectada" description="Conecte a conta de vendedor para consultar categorias, validar e publicar anúncios e receber vendas." />
        ) : (
          accounts.map((a) => {
            const [label, tone] = STATUS[a.status];
            return (
              <Card key={a.id}>
                <CardHeader>
                  <CardTitle className="flex flex-wrap items-center gap-2">
                    {a.nickname ?? a.external_account_id} <StatusBadge tone={tone}>{label}</StatusBadge>
                  </CardTitle>
                  <CardDescription>
                    ID {a.external_account_id} · site {a.site_id} · conectada em {formatDateTime(a.created_at)}
                  </CardDescription>
                </CardHeader>
                <CardContent className="grid gap-3 text-sm">
                  <dl className="grid gap-2 sm:grid-cols-3">
                    <div>
                      <dt className="text-muted-foreground">Permissões concedidas</dt>
                      <dd>{a.granted_scopes.length ? a.granted_scopes.join(", ") : "—"}</dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Modelo de publicação</dt>
                      <dd>{a.user_product_seller === null ? "Não verificado" : a.user_product_seller ? "User Products (family_name)" : "Clássico (title)"}</dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Última consulta</dt>
                      <dd>{formatDateTime(a.last_synced_at)}</dd>
                    </div>
                  </dl>
                  {a.last_error ? (
                    <p role="alert" className="rounded-md border border-destructive/40 bg-destructive/5 p-2 text-destructive">{a.last_error}</p>
                  ) : null}
                  {a.status === "reauthorization_required" && canConnect ? (
                    <div>
                      <Button asChild size="sm">
                        <a href="/api/integrations/mercado-livre/start">Autorizar novamente</a>
                      </Button>
                    </div>
                  ) : null}
                  {canConnect && a.status !== "disconnected" ? <AccountActions accountId={a.id} nickname={a.nickname ?? a.external_account_id} /> : null}
                  {canConnect && a.status === "active" && !a.account_tags.includes("test_user") ? <CreateTestUser accountId={a.id} /> : null}
                </CardContent>
              </Card>
            );
          })
        )}
      </div>
    </>
  );
}
