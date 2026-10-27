import type { Metadata } from "next";
import Link from "next/link";
import { Boxes, FileSpreadsheet, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState, ErrorState } from "@/components/layout/states";
import { StatusBadge } from "@/components/ui/status-badge";
import { flatParams, pageNumber, Pagination, SortLink } from "@/components/data/pagination";
import { createClient } from "@/lib/supabase/server";
import { dec, formatBRL } from "@/lib/money";
import { formatDateTime } from "@/lib/dates";
import { normalizeText } from "@/features/catalog/normalize";
import { can } from "@/features/organizations/roles";
import { requireOrgContext } from "@/server/session";

export const metadata: Metadata = { title: "Produtos e ofertas" };

const PAGE_SIZE = 25;

export default async function ProductsPage({ searchParams }: PageProps<"/app/products">) {
  const ctx = await requireOrgContext();
  const params = flatParams(await searchParams);
  const page = pageNumber(params.page);
  const q = normalizeText(params.q ?? "").slice(0, 80);
  const skuQuery = (params.q ?? "").trim().toUpperCase().replace(/[^A-Z0-9-]/g, "").slice(0, 60);
  const supabase = await createClient();

  const [connections] = await Promise.all([
    supabase.from("supplier_connections").select("id, display_name").eq("organization_id", ctx.organization.id).order("display_name"),
  ]);

  const needsInner = params.stock === "zero" || Boolean(params.supplier);
  const plainQuery = supabase
    .from("catalog_products")
    .select(
      "id, title, brand, model, gtin, category, updated_at, is_example, offers:supplier_offers(id, sku, supplier_cost, inbound_shipping_cost, supplier_handling_fee, available_stock, status, cost_updated_at, supplier_connection_id, connection:supplier_connections(display_name))",
      { count: "exact" },
    );
  // Mesmo formato de resultado; "!inner" apenas restringe os produtos aos que têm ofertas que atendem aos filtros.
  const innerQuery = supabase
    .from("catalog_products")
    .select(
      "id, title, brand, model, gtin, category, updated_at, is_example, offers:supplier_offers!inner(id, sku, supplier_cost, inbound_shipping_cost, supplier_handling_fee, available_stock, status, cost_updated_at, supplier_connection_id, connection:supplier_connections(display_name))",
      { count: "exact" },
    ) as unknown as typeof plainQuery;
  let query = (needsInner ? innerQuery : plainQuery).eq("organization_id", ctx.organization.id);

  if (q || skuQuery) {
    const filters: string[] = [];
    if (q) filters.push(`normalized_title.ilike.%${q}%`, `brand.ilike.%${q}%`, `model.ilike.%${q}%`);
    if (/^\d{8,14}$/.test(skuQuery)) filters.push(`gtin.eq.${skuQuery}`);
    if (skuQuery) {
      const { data: skuHits } = await supabase
        .from("supplier_offers")
        .select("catalog_product_id")
        .eq("organization_id", ctx.organization.id)
        .ilike("sku", `%${skuQuery}%`)
        .limit(200);
      const ids = [...new Set((skuHits ?? []).map((r) => r.catalog_product_id))];
      if (ids.length) filters.push(`id.in.(${ids.join(",")})`);
    }
    if (filters.length) query = query.or(filters.join(","));
  }
  if (params.stock === "zero") query = query.eq("offers.available_stock", 0);
  if (params.supplier && /^[0-9a-f-]{36}$/.test(params.supplier)) query = query.eq("offers.supplier_connection_id", params.supplier);

  const sortField = params.sort === "title" ? "normalized_title" : "updated_at";
  query = query.order(sortField, { ascending: params.dir === "asc" }).range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
  const { data, count, error } = await query;
  const canWrite = can(ctx.role, "catalog.write");

  return (
    <>
      <PageHeader
        title="Produtos e ofertas"
        description="Catálogo da empresa com as ofertas de cada fornecedor. Custos e estoques mostram a data da última atualização."
        actions={
          canWrite ? (
            <>
              <Button variant="outline" asChild>
                <Link href="/app/imports/new">
                  <FileSpreadsheet aria-hidden /> Importar planilha
                </Link>
              </Button>
              <Button asChild>
                <Link href="/app/products/new">
                  <Plus aria-hidden /> Novo produto
                </Link>
              </Button>
            </>
          ) : null
        }
      />
      <form className="mb-4 flex flex-wrap items-end gap-2" role="search">
        <div className="grid gap-1">
          <label htmlFor="q" className="text-xs text-muted-foreground">Busca</label>
          <Input id="q" name="q" defaultValue={params.q ?? ""} placeholder="Título, marca, SKU ou GTIN" className="w-64" />
        </div>
        <div className="grid gap-1">
          <label htmlFor="supplier" className="text-xs text-muted-foreground">Fornecedor</label>
          <select id="supplier" name="supplier" defaultValue={params.supplier ?? ""} className="h-8 rounded-lg border bg-background px-2 text-sm">
            <option value="">Todos</option>
            {(connections.data ?? []).map((c) => (
              <option key={c.id} value={c.id}>{c.display_name}</option>
            ))}
          </select>
        </div>
        <div className="grid gap-1">
          <label htmlFor="stock" className="text-xs text-muted-foreground">Estoque</label>
          <select id="stock" name="stock" defaultValue={params.stock ?? ""} className="h-8 rounded-lg border bg-background px-2 text-sm">
            <option value="">Qualquer</option>
            <option value="zero">Sem estoque</option>
          </select>
        </div>
        <Button type="submit" variant="secondary">Filtrar</Button>
        {params.q || params.supplier || params.stock ? (
          <Button variant="ghost" asChild>
            <Link href="/app/products">Limpar</Link>
          </Button>
        ) : null}
      </form>

      {error ? (
        <ErrorState description="Não foi possível consultar o catálogo. Recarregue a página." />
      ) : !data || data.length === 0 ? (
        <EmptyState
          icon={Boxes}
          title={params.q || params.stock || params.supplier ? "Nenhum produto encontrado" : "Catálogo vazio"}
          description={params.q || params.stock || params.supplier ? "Ajuste os filtros da busca." : "Cadastre um fornecedor e adicione produtos manualmente ou por planilha CSV/Excel."}
          action={
            canWrite && !params.q ? (
              <Button asChild>
                <Link href="/app/suppliers">Cadastrar fornecedor</Link>
              </Button>
            ) : null
          }
        />
      ) : (
        <Card>
          <CardContent className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>
                    <SortLink pathname="/app/products" params={params} field="title" label="Produto" />
                  </TableHead>
                  <TableHead>Ofertas</TableHead>
                  <TableHead className="text-right">Menor custo total</TableHead>
                  <TableHead className="text-right">Estoque total</TableHead>
                  <TableHead>
                    <SortLink pathname="/app/products" params={params} field="updated" label="Atualizado" />
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.map((p) => {
                  const costs = p.offers.map((o) => dec(o.supplier_cost).plus(o.inbound_shipping_cost).plus(o.supplier_handling_fee));
                  const minCost = costs.length ? costs.reduce((a, b) => (a.lessThan(b) ? a : b)) : null;
                  const stock = p.offers.reduce((acc, o) => acc + o.available_stock, 0);
                  return (
                    <TableRow key={p.id}>
                      <TableCell className="max-w-md">
                        <Link href={`/app/products/${p.id}`} className="font-medium hover:underline">{p.title}</Link>
                        <div className="text-xs text-muted-foreground">
                          {[p.brand, p.model, p.gtin ? `GTIN ${p.gtin}` : null].filter(Boolean).join(" · ")}
                          {p.is_example ? " · exemplo" : ""}
                        </div>
                      </TableCell>
                      <TableCell className="text-sm">
                        {p.offers.length === 0 ? (
                          <StatusBadge tone="warning">Sem oferta</StatusBadge>
                        ) : (
                          p.offers.map((o) => o.connection?.display_name).filter(Boolean).join(", ")
                        )}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{formatBRL(minCost)}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {stock === 0 ? <StatusBadge tone="danger">0</StatusBadge> : stock.toLocaleString("pt-BR")}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">{formatDateTime(p.updated_at)}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
            <Pagination pathname="/app/products" params={params} page={page} pageSize={PAGE_SIZE} total={count ?? 0} />
          </CardContent>
        </Card>
      )}
    </>
  );
}
