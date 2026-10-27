import type { Metadata } from "next";
import Link from "next/link";
import { ExternalLink, Megaphone } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/layout/states";
import { StatusBadge } from "@/components/ui/status-badge";
import { createClient } from "@/lib/supabase/server";
import { formatBRL } from "@/lib/money";
import { formatDateTime } from "@/lib/dates";
import { DRAFT_STATUS, LISTING_STATUS } from "@/features/listings/status";
import { RefreshListingButton } from "@/features/listings/components/draft-forms";
import { can } from "@/features/organizations/roles";
import { requireOrgContext } from "@/server/session";

export const metadata: Metadata = { title: "Anúncios" };

export default async function ListingsPage() {
  const ctx = await requireOrgContext();
  const supabase = await createClient();
  const [drafts, listings] = await Promise.all([
    supabase
      .from("listing_drafts")
      .select("id, title, family_name, status, target_price, target_stock, updated_at, product:catalog_products(title), account:marketplace_accounts(nickname)")
      .eq("organization_id", ctx.organization.id)
      .neq("status", "published")
      .order("updated_at", { ascending: false })
      .limit(100),
    supabase
      .from("marketplace_listings")
      .select("id, external_item_id, title, family_name, status, price, available_stock, permalink, last_synced_at, account:marketplace_accounts(nickname), offer:supplier_offers(available_stock, sku)")
      .eq("organization_id", ctx.organization.id)
      .order("created_at", { ascending: false })
      .limit(200),
  ]);
  const canWrite = can(ctx.role, "listings.write");

  return (
    <>
      <PageHeader title="Anúncios" description="Rascunhos preparados aqui e anúncios efetivamente criados no Mercado Livre. Para criar um rascunho, abra um produto e use “Preparar anúncio”." />
      <div className="grid gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Rascunhos</CardTitle>
            <CardDescription>Nada é publicado sem validação e confirmação explícita.</CardDescription>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            {!drafts.data || drafts.data.length === 0 ? (
              <EmptyState icon={Megaphone} title="Nenhum rascunho" description="Abra um produto do catálogo e clique em “Preparar anúncio”." className="py-8" />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Anúncio</TableHead>
                    <TableHead>Conta</TableHead>
                    <TableHead className="text-right">Preço</TableHead>
                    <TableHead className="text-right">Estoque</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Atualizado</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {drafts.data.map((d) => {
                    const [label, tone] = DRAFT_STATUS[d.status];
                    return (
                      <TableRow key={d.id}>
                        <TableCell>
                          <Link href={`/app/listings/${d.id}`} className="font-medium hover:underline">{d.title || d.family_name || d.product?.title}</Link>
                        </TableCell>
                        <TableCell>{d.account?.nickname ?? "—"}</TableCell>
                        <TableCell className="text-right tabular-nums">{formatBRL(d.target_price)}</TableCell>
                        <TableCell className="text-right tabular-nums">{d.target_stock ?? "—"}</TableCell>
                        <TableCell><StatusBadge tone={tone}>{label}</StatusBadge></TableCell>
                        <TableCell className="text-sm text-muted-foreground">{formatDateTime(d.updated_at)}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Anúncios no Mercado Livre</CardTitle>
            <CardDescription>Dados conforme a última consulta à API. Estoque do fornecedor abaixo do anunciado é sinalizado.</CardDescription>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            {!listings.data || listings.data.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhum anúncio publicado por esta plataforma.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Anúncio</TableHead>
                    <TableHead>Conta</TableHead>
                    <TableHead className="text-right">Preço</TableHead>
                    <TableHead className="text-right">Estoque ML / fornecedor</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Consultado</TableHead>
                    {canWrite ? <TableHead /> : null}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {listings.data.map((l) => {
                    const [label, tone] = LISTING_STATUS[l.status] ?? [l.status, "neutral"];
                    const supplierStock = l.offer?.available_stock ?? null;
                    const mismatch = supplierStock !== null && l.available_stock !== null && supplierStock < l.available_stock;
                    return (
                      <TableRow key={l.id}>
                        <TableCell>
                          <div className="font-medium">{l.title || l.family_name || l.external_item_id}</div>
                          <div className="flex items-center gap-1 font-mono text-xs text-muted-foreground">
                            {l.external_item_id}
                            {l.permalink ? (
                              <a href={l.permalink} target="_blank" rel="noopener noreferrer" aria-label="Abrir no Mercado Livre">
                                <ExternalLink className="size-3" />
                              </a>
                            ) : null}
                          </div>
                        </TableCell>
                        <TableCell>{l.account?.nickname}</TableCell>
                        <TableCell className="text-right tabular-nums">{formatBRL(l.price)}</TableCell>
                        <TableCell className="text-right tabular-nums">
                          {l.available_stock ?? "—"} / {supplierStock ?? "—"}
                          {mismatch ? <StatusBadge tone="danger" className="ml-2">Fornecedor com menos</StatusBadge> : null}
                        </TableCell>
                        <TableCell><StatusBadge tone={tone}>{label}</StatusBadge></TableCell>
                        <TableCell className="text-sm text-muted-foreground">{formatDateTime(l.last_synced_at)}</TableCell>
                        {canWrite ? <TableCell><RefreshListingButton listingId={l.id} /></TableCell> : null}
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
