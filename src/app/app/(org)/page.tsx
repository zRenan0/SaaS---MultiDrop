import type { Metadata } from "next";
import Link from "next/link";
import { AlertTriangle, ArrowRight } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/layout/page-header";
import { createClient } from "@/lib/supabase/server";
import { requireOrgContext } from "@/server/session";

export const metadata: Metadata = { title: "Visão geral" };

async function countRows(
  query: PromiseLike<{ count: number | null; error: unknown }>,
): Promise<number | null> {
  const { count, error } = await query;
  return error ? null : count;
}

export default async function OverviewPage() {
  const ctx = await requireOrgContext();
  const supabase = await createClient();
  const org = ctx.organization.id;
  const head = { count: "exact" as const, head: true };

  const [products, offers, outOfStock, accounts, activeListings, openOrders, pendingErrors, deadJobs] = await Promise.all([
    countRows(supabase.from("catalog_products").select("id", head).eq("organization_id", org)),
    countRows(supabase.from("supplier_offers").select("id", head).eq("organization_id", org)),
    countRows(supabase.from("supplier_offers").select("id", head).eq("organization_id", org).eq("available_stock", 0)),
    countRows(supabase.from("marketplace_accounts").select("id", head).eq("organization_id", org).neq("status", "disconnected")),
    countRows(supabase.from("marketplace_listings").select("id", head).eq("organization_id", org).eq("status", "active")),
    countRows(supabase.from("orders").select("id", head).eq("organization_id", org).in("fulfillment_status", ["pending", "awaiting_supplier", "forwarded", "problem"])),
    countRows(supabase.from("integration_errors").select("id", head).eq("organization_id", org).is("resolved_at", null)),
    countRows(supabase.from("sync_jobs").select("id", head).eq("organization_id", org).eq("status", "dead")),
  ]);

  const stats = [
    { label: "Produtos no catálogo", value: products, href: "/app/products" },
    { label: "Ofertas de fornecedores", value: offers, href: "/app/products" },
    { label: "Ofertas sem estoque", value: outOfStock, href: "/app/products?stock=zero" },
    { label: "Contas do Mercado Livre", value: accounts, href: "/app/integrations" },
    { label: "Anúncios ativos", value: activeListings, href: "/app/listings" },
    { label: "Pedidos em andamento", value: openOrders, href: "/app/orders" },
  ];

  const steps = [
    { done: (offers ?? 0) > 0, label: "Cadastre fornecedores e produtos (manual ou planilha)", href: "/app/suppliers" },
    { done: false, label: "Configure o perfil de preço e as tarifas", href: "/app/pricing" },
    { done: (accounts ?? 0) > 0, label: "Conecte sua conta do Mercado Livre", href: "/app/integrations" },
    { done: (activeListings ?? 0) > 0, label: "Prepare e publique o primeiro anúncio", href: "/app/listings" },
  ];

  return (
    <>
      <PageHeader title="Visão geral" description={`Resumo da operação de ${ctx.organization.name}. Os números são consultados no banco a cada acesso.`} />
      {(pendingErrors ?? 0) > 0 || (deadJobs ?? 0) > 0 ? (
        <Link href="/app/operations" className="mb-6 flex items-center gap-3 rounded-xl border border-warning/50 bg-warning/10 p-4 text-sm hover:bg-warning/15">
          <AlertTriangle className="size-5 text-warning-foreground" aria-hidden />
          <span>
            {pendingErrors ?? 0} erro(s) de integração sem resolução e {deadJobs ?? 0} tarefa(s) que esgotaram as tentativas. Ver Operações.
          </span>
        </Link>
      ) : null}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {stats.map((s) => (
          <Link key={s.label} href={s.href} className="rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <Card className="h-full transition-colors hover:bg-muted/40">
              <CardHeader>
                <CardDescription>{s.label}</CardDescription>
                <CardTitle className="text-3xl tabular-nums">{s.value === null ? "—" : s.value.toLocaleString("pt-BR")}</CardTitle>
              </CardHeader>
            </Card>
          </Link>
        ))}
      </div>
      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Primeiros passos</CardTitle>
          <CardDescription>Sequência recomendada para começar a vender.</CardDescription>
        </CardHeader>
        <CardContent>
          <ol className="grid gap-2">
            {steps.map((step, i) => (
              <li key={step.label} className="flex items-center justify-between gap-3 rounded-lg border p-3 text-sm">
                <span className="flex items-center gap-3">
                  <span className={`flex size-6 items-center justify-center rounded-full text-xs ${step.done ? "bg-success text-success-foreground" : "bg-muted"}`}>
                    {i + 1}
                  </span>
                  {step.label}
                </span>
                <Button variant="ghost" size="sm" asChild>
                  <Link href={step.href}>
                    Abrir <ArrowRight aria-hidden />
                  </Link>
                </Button>
              </li>
            ))}
          </ol>
        </CardContent>
      </Card>
    </>
  );
}
