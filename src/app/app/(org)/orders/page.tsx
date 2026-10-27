import type { Metadata } from "next";
import Link from "next/link";
import { ShoppingCart } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState, ErrorState } from "@/components/layout/states";
import { StatusBadge } from "@/components/ui/status-badge";
import { flatParams, pageNumber, Pagination } from "@/components/data/pagination";
import { createClient } from "@/lib/supabase/server";
import { formatBRL } from "@/lib/money";
import { formatDateTime } from "@/lib/dates";
import { FULFILLMENT_STATUS } from "@/features/orders/status";
import { PollOrdersButton } from "@/features/orders/components/forms";
import { can } from "@/features/organizations/roles";
import { requireOrgContext } from "@/server/session";

export const metadata: Metadata = { title: "Pedidos" };

const PAGE_SIZE = 25;

export default async function OrdersPage({ searchParams }: PageProps<"/app/orders">) {
  const ctx = await requireOrgContext();
  const params = flatParams(await searchParams);
  const page = pageNumber(params.page);
  const supabase = await createClient();
  let query = supabase
    .from("orders")
    .select("id, external_order_id, status, fulfillment_status, total_amount, ordered_at, buyer_nickname, account:marketplace_accounts(nickname), items:order_items(title, quantity)", { count: "exact" })
    .eq("organization_id", ctx.organization.id);
  if (params.status && params.status in FULFILLMENT_STATUS) query = query.eq("fulfillment_status", params.status as keyof typeof FULFILLMENT_STATUS);
  const q = (params.q ?? "").replace(/\D/g, "").slice(0, 20);
  if (q) query = query.ilike("external_order_id", `%${q}%`);
  const { data, count, error } = await query.order("ordered_at", { ascending: false, nullsFirst: false }).range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
  const { data: accounts } = await supabase.from("marketplace_accounts").select("id, nickname, external_account_id").eq("organization_id", ctx.organization.id).eq("status", "active");

  return (
    <>
      <PageHeader
        title="Pedidos"
        description="Vendas recebidas do Mercado Livre e o encaminhamento de cada uma ao fornecedor."
        actions={can(ctx.role, "orders.forward") ? (accounts ?? []).map((a) => <PollOrdersButton key={a.id} accountId={a.id} label={a.nickname ?? a.external_account_id} />) : null}
      />
      <form className="mb-4 flex flex-wrap items-end gap-2" role="search">
        <div className="grid gap-1">
          <label htmlFor="q" className="text-xs text-muted-foreground">Número do pedido</label>
          <Input id="q" name="q" defaultValue={params.q ?? ""} inputMode="numeric" className="w-48" />
        </div>
        <div className="grid gap-1">
          <label htmlFor="status" className="text-xs text-muted-foreground">Andamento</label>
          <select id="status" name="status" defaultValue={params.status ?? ""} className="h-8 rounded-lg border bg-background px-2 text-sm">
            <option value="">Todos</option>
            {Object.entries(FULFILLMENT_STATUS).map(([k, [label]]) => <option key={k} value={k}>{label}</option>)}
          </select>
        </div>
        <Button type="submit" variant="secondary">Filtrar</Button>
      </form>
      {error ? (
        <ErrorState />
      ) : !data || data.length === 0 ? (
        <EmptyState
          icon={ShoppingCart}
          title={params.q || params.status ? "Nenhum pedido encontrado" : "Nenhum pedido recebido"}
          description="Pedidos chegam pelas notificações do Mercado Livre ou pela busca de vendas recentes da conta conectada."
          action={!accounts?.length ? <Button asChild><Link href="/app/integrations">Conectar conta</Link></Button> : null}
        />
      ) : (
        <Card>
          <CardContent className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Pedido</TableHead>
                  <TableHead>Itens</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead>Status no ML</TableHead>
                  <TableHead>Andamento</TableHead>
                  <TableHead>Data</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.map((o) => {
                  const [label, tone] = FULFILLMENT_STATUS[o.fulfillment_status];
                  return (
                    <TableRow key={o.id}>
                      <TableCell>
                        <Link href={`/app/orders/${o.id}`} className="font-mono font-medium hover:underline">{o.external_order_id}</Link>
                        <div className="text-xs text-muted-foreground">{o.account?.nickname}</div>
                      </TableCell>
                      <TableCell className="max-w-xs truncate text-sm">{o.items.map((i) => `${i.quantity}× ${i.title ?? ""}`).join(", ")}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatBRL(o.total_amount)}</TableCell>
                      <TableCell className="text-sm">{o.status}</TableCell>
                      <TableCell><StatusBadge tone={tone}>{label}</StatusBadge></TableCell>
                      <TableCell className="text-sm text-muted-foreground">{formatDateTime(o.ordered_at)}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
            <Pagination pathname="/app/orders" params={params} page={page} pageSize={PAGE_SIZE} total={count ?? 0} />
          </CardContent>
        </Card>
      )}
    </>
  );
}
