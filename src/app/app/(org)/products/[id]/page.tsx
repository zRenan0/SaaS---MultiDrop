import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Calculator, CheckCircle2, Megaphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/layout/states";
import { StatusBadge } from "@/components/ui/status-badge";
import { createClient } from "@/lib/supabase/server";
import { dec, formatBRL } from "@/lib/money";
import { formatDateTime, isOlderThan } from "@/lib/dates";
import { AddOfferForm, DeleteProductButton, EditOfferDialog } from "@/features/catalog/components/product-forms";
import { can } from "@/features/organizations/roles";
import { requireOrgContext } from "@/server/session";
import { CompetitorSearchForm } from "@/features/competitors/components";

export const metadata: Metadata = { title: "Produto" };

const OFFER_STATUS = { active: ["Ativa", "success"], paused: ["Pausada", "neutral"], out_of_stock: ["Sem estoque", "danger"], discontinued: ["Descontinuada", "neutral"] } as const;

export default async function ProductPage({ params, searchParams }: PageProps<"/app/products/[id]">) {
  const { id } = await params;
  const sp = await searchParams;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const ctx = await requireOrgContext();
  const supabase = await createClient();
  const { data: product } = await supabase
    .from("catalog_products")
    .select("*, offers:supplier_offers(*, connection:supplier_connections(display_name, status))")
    .eq("id", id)
    .eq("organization_id", ctx.organization.id)
    .maybeSingle();
  if (!product) notFound();

  const { data: connections } = await supabase
    .from("supplier_connections")
    .select("id, display_name")
    .eq("organization_id", ctx.organization.id)
    .neq("status", "disabled")
    .order("display_name");

  const [{ data: competitors }, { data: mlAccounts }] = await Promise.all([
    supabase
      .from("competitor_snapshots")
      .select("id, external_item_id, title, observed_price, observed_at, source, metadata")
      .eq("organization_id", ctx.organization.id)
      .eq("catalog_product_id", product.id)
      .order("observed_at", { ascending: false })
      .limit(30),
    supabase.from("marketplace_accounts").select("id, nickname, external_account_id").eq("organization_id", ctx.organization.id).eq("status", "active"),
  ]);
  const competitorPrices = (competitors ?? []).map((c) => Number(c.observed_price)).sort((a, b) => a - b);

  const images = (Array.isArray(product.images) ? product.images : []) as { url?: string; authorized?: boolean }[];
  const canWrite = can(ctx.role, "catalog.write");

  return (
    <>
      <PageHeader
        title={product.title}
        description={[product.brand, product.model, product.gtin ? `GTIN ${product.gtin}` : null, product.category].filter(Boolean).join(" · ") || "Sem marca/modelo informados"}
        actions={
          <>
            <Button variant="outline" asChild>
              <Link href={`/app/pricing?product=${product.id}`}>
                <Calculator aria-hidden /> Calcular lucro
              </Link>
            </Button>
            {can(ctx.role, "listings.write") ? (
              <Button asChild>
                <Link href={`/app/listings/new?product=${product.id}`}>
                  <Megaphone aria-hidden /> Preparar anúncio
                </Link>
              </Button>
            ) : null}
          </>
        }
      />
      {sp.saved ? (
        <p role="status" className="mb-4 flex items-center gap-2 rounded-lg border border-success/40 bg-success/10 p-3 text-sm">
          <CheckCircle2 className="size-4 text-success" aria-hidden /> Produto e oferta salvos.
        </p>
      ) : null}
      <div className="grid gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Ofertas de fornecedores</CardTitle>
            <CardDescription>Custo total = custo de aquisição + frete de entrada + taxa de preparação. Custos com mais de 7 dias são sinalizados.</CardDescription>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            {product.offers.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhuma oferta cadastrada.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Fornecedor / SKU</TableHead>
                    <TableHead className="text-right">Custo</TableHead>
                    <TableHead className="text-right">Custo total</TableHead>
                    <TableHead className="text-right">Estoque</TableHead>
                    <TableHead>Prazo</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Custo atualizado</TableHead>
                    {canWrite ? <TableHead /> : null}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {product.offers.map((o) => {
                    const [label, tone] = OFFER_STATUS[o.status];
                    const total = dec(o.supplier_cost).plus(o.inbound_shipping_cost).plus(o.supplier_handling_fee);
                    const stale = isOlderThan(o.cost_updated_at, 24 * 7);
                    return (
                      <TableRow key={o.id}>
                        <TableCell>
                          <div className="font-medium">{o.connection?.display_name}</div>
                          <div className="font-mono text-xs text-muted-foreground">{o.sku}</div>
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{formatBRL(o.supplier_cost)}</TableCell>
                        <TableCell className="text-right tabular-nums">{formatBRL(total)}</TableCell>
                        <TableCell className="text-right tabular-nums">{o.available_stock}</TableCell>
                        <TableCell>{o.handling_time_days === null ? "—" : `${o.handling_time_days} dia(s)`}</TableCell>
                        <TableCell>
                          <StatusBadge tone={tone}>{label}</StatusBadge>
                        </TableCell>
                        <TableCell className="text-sm">
                          {formatDateTime(o.cost_updated_at)}
                          {stale ? <StatusBadge tone="warning" className="ml-2">Desatualizado</StatusBadge> : null}
                        </TableCell>
                        {canWrite ? (
                          <TableCell>
                            <EditOfferDialog offer={o} />
                          </TableCell>
                        ) : null}
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {canWrite && connections && connections.length > 0 ? (
          <Card>
            <CardHeader>
              <CardTitle>Adicionar oferta de outro fornecedor</CardTitle>
            </CardHeader>
            <CardContent>
              <AddOfferForm productId={product.id} connections={connections} />
            </CardContent>
          </Card>
        ) : null}

        <Card>
          <CardHeader>
            <CardTitle>Preços observados no Mercado Livre</CardTitle>
            <CardDescription>
              Fonte: catálogo oficial do Mercado Livre, consultado com o token da sua conta. Não inclui anúncios fora do catálogo; preço observado não é o custo do concorrente.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 text-sm">
            {competitorPrices.length > 0 ? (
              <>
                <p>
                  {competitorPrices.length} observação(ões) · menor {formatBRL(competitorPrices[0])} · mediana {formatBRL(competitorPrices[Math.floor(competitorPrices.length / 2)])} · última em{" "}
                  {formatDateTime(competitors?.[0]?.observed_at)}
                </p>
                <ul className="grid gap-1">
                  {(competitors ?? []).slice(0, 10).map((c) => (
                    <li key={c.id} className="flex flex-wrap justify-between gap-2 border-b py-1">
                      <span className="font-mono text-xs">{c.external_item_id}</span>
                      <span>{formatBRL(c.observed_price)}</span>
                      <span className="text-muted-foreground">{formatDateTime(c.observed_at)}</span>
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <p className="text-muted-foreground">Nenhuma observação registrada.</p>
            )}
            {canWrite && mlAccounts && mlAccounts.length > 0 ? (
              <CompetitorSearchForm productId={product.id} accounts={mlAccounts.map((a) => ({ id: a.id, label: a.nickname ?? a.external_account_id }))} />
            ) : (
              <p className="text-xs text-muted-foreground">Conecte uma conta do Mercado Livre para pesquisar.</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Dados do produto</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 text-sm">
            {product.description ? <p className="whitespace-pre-line text-muted-foreground">{product.description}</p> : <p className="text-muted-foreground">Sem descrição.</p>}
            {images.length > 0 ? (
              <ul className="grid gap-1">
                {images.map((img) => (
                  <li key={img.url} className="flex items-center gap-2 break-all">
                    <span className="font-mono text-xs">{img.url}</span>
                    {img.authorized ? <StatusBadge tone="success">Autorizada</StatusBadge> : <StatusBadge tone="warning">Autorização não confirmada</StatusBadge>}
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState title="Sem imagens" description="Anúncios exigem imagens autorizadas." className="py-6" />
            )}
            <p className="text-xs text-muted-foreground">Criado em {formatDateTime(product.created_at)} · atualizado em {formatDateTime(product.updated_at)}</p>
            {can(ctx.role, "catalog.delete") ? (
              <div>
                <DeleteProductButton productId={product.id} />
              </div>
            ) : null}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
