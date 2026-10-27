import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertTriangle } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageHeader } from "@/components/layout/page-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { createClient } from "@/lib/supabase/server";
import { dec, formatBRL } from "@/lib/money";
import { formatDateTime } from "@/lib/dates";
import { FULFILLMENT_STATUS, PO_STATUS, type PurchaseOrderStatus } from "@/features/orders/status";
import { CreatePurchaseOrderForm, PurchaseOrderStatusActions, ShipmentForm, SyncOrderButton } from "@/features/orders/components/forms";
import { can } from "@/features/organizations/roles";
import { requireOrgContext } from "@/server/session";

export const metadata: Metadata = { title: "Pedido" };

export default async function OrderPage({ params }: PageProps<"/app/orders/[id]">) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const ctx = await requireOrgContext();
  const supabase = await createClient();
  const { data: order } = await supabase
    .from("orders")
    .select(
      "*, account:marketplace_accounts(nickname), items:order_items(id, external_item_id, title, sku, quantity, unit_price, item_total, sale_fee, listing:marketplace_listings(id, title, external_item_id), offer:supplier_offers(id, sku, available_stock, supplier_cost, inbound_shipping_cost, supplier_handling_fee, cost_updated_at, supplier_connection_id, catalog_product_id, connection:supplier_connections(id, display_name, configuration, dropship_agreement_confirmed))), purchase_orders:supplier_purchase_orders(id, status, total_cost, notes, external_purchase_order_id, submitted_at, accepted_at, created_at, connection:supplier_connections(display_name), shipments(id, carrier, tracking_code, tracking_url, status, dispatched_at))",
    )
    .eq("id", id)
    .eq("organization_id", ctx.organization.id)
    .maybeSingle();
  if (!order) notFound();

  const { data: connections } = await supabase.from("supplier_connections").select("id, display_name").eq("organization_id", ctx.organization.id).neq("status", "disabled");
  const meta = (order.metadata ?? {}) as { problems?: string[]; shipping_status?: string; tracking_number?: string };
  const [label, tone] = FULFILLMENT_STATUS[order.fulfillment_status];
  const canForward = can(ctx.role, "orders.forward");

  const supplierCost = order.items.reduce((acc, i) => {
    if (!i.offer) return acc;
    return acc.plus(dec(i.offer.supplier_cost).plus(i.offer.inbound_shipping_cost).plus(i.offer.supplier_handling_fee).times(i.quantity));
  }, dec(0));
  const fees = order.items.reduce((acc, i) => acc.plus(i.sale_fee ?? 0), dec(0));
  const allLinked = order.items.every((i) => i.offer);
  const defaultConnection = order.items.find((i) => i.offer)?.offer?.connection?.id;
  const activePo = order.purchase_orders.find((p) => !["canceled", "rejected", "failed"].includes(p.status));

  return (
    <>
      <PageHeader
        title={`Pedido ${order.external_order_id}`}
        description={
          <>
            <StatusBadge tone={tone}>{label}</StatusBadge> Status no Mercado Livre: {order.status} · conta {order.account?.nickname} · {formatDateTime(order.ordered_at)}
            {order.buyer_nickname ? ` · comprador ${order.buyer_nickname}` : ""}
          </>
        }
        actions={canForward ? <SyncOrderButton orderId={order.id} /> : null}
      />
      <div className="grid gap-6">
        {meta.problems && meta.problems.length > 0 ? (
          <div role="alert" className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm">
            <p className="flex items-center gap-2 font-medium">
              <AlertTriangle className="size-4" aria-hidden /> Este pedido requer atenção
            </p>
            <ul className="mt-2 list-disc pl-5">
              {meta.problems.map((p) => <li key={p}>{p}</li>)}
            </ul>
          </div>
        ) : null}

        <Card>
          <CardHeader>
            <CardTitle>Itens vendidos</CardTitle>
            <CardDescription>Estoque e custo exibidos são os últimos registrados para a oferta do fornecedor (com data). Confirme com o fornecedor antes de encaminhar.</CardDescription>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Item</TableHead>
                  <TableHead className="text-right">Qtd.</TableHead>
                  <TableHead className="text-right">Preço unit.</TableHead>
                  <TableHead className="text-right">Tarifa ML</TableHead>
                  <TableHead>Fornecedor / SKU</TableHead>
                  <TableHead className="text-right">Estoque registrado</TableHead>
                  <TableHead>Custo atualizado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {order.items.map((i) => (
                  <TableRow key={i.id}>
                    <TableCell>
                      <div className="font-medium">{i.title}</div>
                      <div className="font-mono text-xs text-muted-foreground">{i.external_item_id}</div>
                    </TableCell>
                    <TableCell className="text-right">{i.quantity}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatBRL(i.unit_price)}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatBRL(i.sale_fee)}</TableCell>
                    <TableCell>
                      {i.offer ? (
                        <>
                          <Link href={`/app/products/${i.offer.catalog_product_id}`} className="hover:underline">{i.offer.connection?.display_name}</Link>
                          <div className="font-mono text-xs">{i.offer.sku}</div>
                          {!i.offer.connection?.dropship_agreement_confirmed ? <StatusBadge tone="warning">Acordo de despacho não confirmado</StatusBadge> : null}
                        </>
                      ) : (
                        <StatusBadge tone="danger">Sem oferta vinculada</StatusBadge>
                      )}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{i.offer ? i.offer.available_stock : "—"}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{i.offer ? formatDateTime(i.offer.cost_updated_at) : "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <dl className="mt-4 grid gap-2 text-sm sm:grid-cols-4">
              <div><dt className="text-muted-foreground">Total da venda</dt><dd className="font-medium">{formatBRL(order.total_amount)}</dd></div>
              <div><dt className="text-muted-foreground">Tarifas informadas pelo ML</dt><dd>{formatBRL(fees)}</dd></div>
              <div><dt className="text-muted-foreground">Custo do fornecedor (registrado)</dt><dd>{allLinked ? formatBRL(supplierCost) : "incompleto"}</dd></div>
              <div><dt className="text-muted-foreground">Envio (ML)</dt><dd>{meta.shipping_status ?? "sem informação"}{meta.tracking_number ? ` · ${meta.tracking_number}` : ""}</dd></div>
            </dl>
            <p className="mt-2 text-xs text-muted-foreground">Etiqueta e dados do comprador ficam no painel de vendas do Mercado Livre; a plataforma não armazena endereço do comprador.</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Encaminhamento ao fornecedor</CardTitle>
            <CardDescription>
              Fornecedores sem API de pedidos são acionados manualmente (e-mail, WhatsApp, portal). Registre cada etapa: a plataforma não envia pagamentos nem compras automaticamente.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-6">
            {order.purchase_orders.length === 0 ? <p className="text-sm text-muted-foreground">Nenhum pedido de compra registrado.</p> : null}
            {order.purchase_orders.map((po) => {
              const [poLabel, poTone] = PO_STATUS[po.status as PurchaseOrderStatus];
              return (
                <div key={po.id} className="grid gap-3 rounded-lg border p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <span className="font-medium">{po.connection?.display_name}</span> <StatusBadge tone={poTone}>{poLabel}</StatusBadge>
                    </div>
                    <span className="text-sm text-muted-foreground">
                      Custo {formatBRL(po.total_cost)} · criado {formatDateTime(po.created_at)}
                      {po.submitted_at ? ` · enviado ${formatDateTime(po.submitted_at)}` : ""}
                      {po.external_purchase_order_id ? ` · nº ${po.external_purchase_order_id}` : ""}
                    </span>
                  </div>
                  {po.notes ? <p className="text-sm text-muted-foreground">{po.notes}</p> : null}
                  {po.shipments.length > 0 ? (
                    <ul className="text-sm">
                      {po.shipments.map((s) => (
                        <li key={s.id}>
                          Rastreio {s.carrier ? `${s.carrier} ` : ""}
                          {s.tracking_url ? (
                            <a className="font-mono underline" href={s.tracking_url} target="_blank" rel="noopener noreferrer">{s.tracking_code}</a>
                          ) : (
                            <span className="font-mono">{s.tracking_code}</span>
                          )}{" "}
                          · {formatDateTime(s.dispatched_at)}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                  {canForward ? <PurchaseOrderStatusActions purchaseOrderId={po.id} status={po.status as PurchaseOrderStatus} /> : null}
                  {canForward && ["accepted", "shipped"].includes(po.status) ? <ShipmentForm purchaseOrderId={po.id} orderId={order.id} /> : null}
                </div>
              );
            })}
            {canForward && !activePo && order.fulfillment_status !== "canceled" && order.status === "paid" ? (
              <CreatePurchaseOrderForm
                orderId={order.id}
                connections={(connections ?? []).map((c) => ({ id: c.id, label: c.display_name }))}
                defaultConnectionId={defaultConnection}
                estimatedCost={allLinked ? supplierCost.toFixed(2) : undefined}
              />
            ) : null}
            {order.status !== "paid" && order.fulfillment_status !== "canceled" ? (
              <p className="text-sm text-muted-foreground">Encaminhe ao fornecedor somente após o pagamento confirmado pelo Mercado Livre.</p>
            ) : null}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
