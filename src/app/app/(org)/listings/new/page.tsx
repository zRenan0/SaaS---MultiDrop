import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/layout/states";
import { createClient } from "@/lib/supabase/server";
import { formatBRL } from "@/lib/money";
import { NewDraftForm } from "@/features/listings/components/draft-forms";
import { can } from "@/features/organizations/roles";
import { requireOrgContext } from "@/server/session";

export const metadata: Metadata = { title: "Preparar anúncio" };

export default async function NewListingPage({ searchParams }: PageProps<"/app/listings/new">) {
  const ctx = await requireOrgContext();
  const sp = await searchParams;
  const productId = typeof sp.product === "string" && /^[0-9a-f-]{36}$/.test(sp.product) ? sp.product : null;
  if (!can(ctx.role, "listings.write")) return <EmptyState title="Sem permissão" />;
  if (!productId) {
    return (
      <EmptyState
        title="Escolha um produto"
        description="Anúncios partem de um produto do catálogo com oferta de fornecedor."
        action={<Button asChild><Link href="/app/products">Ir para produtos</Link></Button>}
      />
    );
  }
  const supabase = await createClient();
  const [{ data: product }, { data: accounts }] = await Promise.all([
    supabase
      .from("catalog_products")
      .select("id, title, offers:supplier_offers(id, sku, supplier_cost, available_stock, status, connection:supplier_connections(display_name))")
      .eq("id", productId)
      .eq("organization_id", ctx.organization.id)
      .maybeSingle(),
    supabase.from("marketplace_accounts").select("id, nickname, external_account_id").eq("organization_id", ctx.organization.id).eq("status", "active"),
  ]);
  if (!product) return <EmptyState title="Produto não encontrado" />;
  const offers = product.offers
    .filter((o) => o.status === "active" && o.available_stock > 0)
    .map((o) => ({ id: o.id, label: `${o.connection?.display_name} · ${o.sku} · ${formatBRL(o.supplier_cost)} · estoque ${o.available_stock}` }));
  return (
    <>
      <PageHeader title="Preparar anúncio" description={product.title} />
      {offers.length === 0 ? (
        <EmptyState title="Sem oferta disponível" description="Nenhuma oferta ativa com estoque. Atualize a oferta do fornecedor antes de anunciar." />
      ) : (
        <Card>
          <CardContent>
            <NewDraftForm productId={product.id} offers={offers} accounts={(accounts ?? []).map((a) => ({ id: a.id, label: a.nickname ?? a.external_account_id }))} />
          </CardContent>
        </Card>
      )}
    </>
  );
}
