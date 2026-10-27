import type { Metadata } from "next";
import Link from "next/link";
import { AlertTriangle, Calculator } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/layout/states";
import { StatusBadge } from "@/components/ui/status-badge";
import { flatParams } from "@/components/data/pagination";
import { createClient } from "@/lib/supabase/server";
import { formatBRL, formatPercent, parseBrlAmount } from "@/lib/money";
import { formatDate, formatDateTime } from "@/lib/dates";
import { calculate } from "@/features/pricing/engine";
import { loadProfiles } from "@/features/pricing/service";
import { Breakdown } from "@/features/pricing/components/breakdown";
import { PricingProfileForm } from "@/features/pricing/components/profile-form";
import { SaveSimulationButton } from "@/features/pricing/components/save-simulation";
import { can } from "@/features/organizations/roles";
import { requireOrgContext } from "@/server/session";

export const metadata: Metadata = { title: "Precificação" };

const UUID = /^[0-9a-f-]{36}$/;

export default async function PricingPage({ searchParams }: PageProps<"/app/pricing">) {
  const ctx = await requireOrgContext();
  const params = flatParams(await searchParams);
  const supabase = await createClient();
  const org = ctx.organization.id;
  const profiles = await loadProfiles(supabase, org);
  const profile = profiles.find((p) => p.id === params.profile) ?? profiles.find((p) => p.isDefault) ?? profiles[0];
  const productId = params.product && UUID.test(params.product) ? params.product : undefined;
  const scenarioPrices = [params.p1, params.p2, params.p3]
    .map((v) => (v ? parseBrlAmount(v) : null))
    .filter((v): v is NonNullable<typeof v> => v !== null && v.greaterThan(0))
    .map((v) => v.toFixed(2));

  const [{ data: products }, product, { data: history }] = await Promise.all([
    supabase.from("catalog_products").select("id, title").eq("organization_id", org).order("normalized_title").limit(500),
    productId
      ? supabase
          .from("catalog_products")
          .select("id, title, offers:supplier_offers(id, sku, supplier_cost, inbound_shipping_cost, supplier_handling_fee, available_stock, status, cost_updated_at, connection:supplier_connections(display_name))")
          .eq("id", productId)
          .eq("organization_id", org)
          .maybeSingle()
          .then((r) => r.data)
      : Promise.resolve(null),
    supabase
      .from("pricing_calculations")
      .select("id, selling_price, estimated_profit, estimated_margin, break_even_price, created_at, calculation_version, product:catalog_products(title), offer:supplier_offers(sku)")
      .eq("organization_id", org)
      .order("created_at", { ascending: false })
      .limit(15),
  ]);

  const comparisons =
    product && profile
      ? product.offers.map((offer) => ({
          offer,
          result: calculate(
            {
              supplierCost: String(offer.supplier_cost),
              inboundShippingCost: String(offer.inbound_shipping_cost),
              supplierHandlingFee: String(offer.supplier_handling_fee),
              costUpdatedAt: offer.cost_updated_at,
            },
            profile.rules,
            scenarioPrices,
          ),
        }))
      : [];
  const best = comparisons
    .filter((c) => c.result.status === "complete" && c.result.suggestedPrice)
    .sort((a, b) => Number(a.result.status === "complete" && a.result.suggestedPrice) - Number(b.result.status === "complete" && b.result.suggestedPrice))[0];
  const selected = comparisons.find((c) => c.offer.id === params.offer) ?? best ?? comparisons[0];
  const canSimulate = can(ctx.role, "pricing.simulate");
  const canConfigure = can(ctx.role, "pricing.configure");

  return (
    <>
      <PageHeader
        title="Precificação"
        description="Lucro por unidade com composição detalhada. Valores marcados como estimados dependem de parâmetros informados por você."
      />
      <div className="grid gap-6">
        {profiles.length === 0 ? (
          <EmptyState
            icon={Calculator}
            title="Configure um perfil de preço"
            description={canConfigure ? "Defina margem desejada, tarifas, tributos estimados e custos adicionais para habilitar a calculadora." : "Peça a um administrador para configurar o perfil de preço."}
          />
        ) : (
          <Card>
            <CardHeader>
              <CardTitle>Calculadora</CardTitle>
              <CardDescription>Escolha o produto e o perfil. Opcionalmente informe até três preços para comparar cenários.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-6">
              <form className="flex flex-wrap items-end gap-3">
                <div className="grid gap-1">
                  <label htmlFor="product" className="text-xs text-muted-foreground">Produto</label>
                  <select id="product" name="product" defaultValue={productId ?? ""} className="h-8 max-w-xs rounded-lg border bg-background px-2 text-sm">
                    <option value="">Selecione</option>
                    {(products ?? []).map((p) => (
                      <option key={p.id} value={p.id}>{p.title}</option>
                    ))}
                  </select>
                </div>
                <div className="grid gap-1">
                  <label htmlFor="profile" className="text-xs text-muted-foreground">Perfil</label>
                  <select id="profile" name="profile" defaultValue={profile?.id} className="h-8 rounded-lg border bg-background px-2 text-sm">
                    {profiles.map((p) => (
                      <option key={p.id} value={p.id}>{p.name}{p.isDefault ? " (padrão)" : ""}</option>
                    ))}
                  </select>
                </div>
                {(["p1", "p2", "p3"] as const).map((k, i) => (
                  <div key={k} className="grid gap-1">
                    <label htmlFor={k} className="text-xs text-muted-foreground">Cenário {i + 1} (R$)</label>
                    <Input id={k} name={k} defaultValue={params[k] ?? ""} inputMode="decimal" className="w-28" />
                  </div>
                ))}
                <Button type="submit">Calcular</Button>
              </form>

              {!product ? (
                <p className="text-sm text-muted-foreground">Selecione um produto para calcular.</p>
              ) : product.offers.length === 0 ? (
                <EmptyState title="Produto sem ofertas" description="Cadastre a oferta de um fornecedor para calcular custos." />
              ) : selected && selected.result.status === "incomplete" ? (
                <div role="alert" className="rounded-lg border border-warning/50 bg-warning/10 p-4 text-sm">
                  <p className="flex items-center gap-2 font-medium">
                    <AlertTriangle className="size-4" aria-hidden /> Não é possível calcular: faltam parâmetros no perfil “{profile?.name}”.
                  </p>
                  <ul className="mt-2 list-disc pl-5">
                    {selected.result.missing.map((m) => <li key={m}>{m}</li>)}
                  </ul>
                </div>
              ) : (
                <>
                  <div className="overflow-x-auto">
                    <h3 className="mb-2 text-sm font-medium">Comparação entre fornecedores</h3>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Fornecedor</TableHead>
                          <TableHead className="text-right">Custo da mercadoria</TableHead>
                          <TableHead className="text-right">Preço mínimo sem prejuízo</TableHead>
                          <TableHead className="text-right">Preço sugerido</TableHead>
                          <TableHead className="text-right">Lucro no sugerido</TableHead>
                          {scenarioPrices.map((p) => <TableHead key={p} className="text-right">Lucro a {formatBRL(p)}</TableHead>)}
                          <TableHead />
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {comparisons.map(({ offer, result }) =>
                          result.status !== "complete" ? null : (
                            <TableRow key={offer.id} data-state={selected?.offer.id === offer.id ? "selected" : undefined}>
                              <TableCell>
                                <div className="font-medium">{offer.connection?.display_name}</div>
                                <div className="text-xs text-muted-foreground">
                                  {offer.sku} · estoque {offer.available_stock}
                                  {offer.available_stock === 0 ? " (sem estoque)" : ""}
                                </div>
                              </TableCell>
                              <TableCell className="text-right tabular-nums">{formatBRL(result.goodsCost)}</TableCell>
                              <TableCell className="text-right tabular-nums">{formatBRL(result.breakEvenPrice)}</TableCell>
                              <TableCell className="text-right font-medium tabular-nums">{formatBRL(result.suggestedPrice)}</TableCell>
                              <TableCell className="text-right tabular-nums">
                                {result.atSuggested ? `${formatBRL(result.atSuggested.profit)} (${formatPercent(result.atSuggested.margin)})` : "—"}
                              </TableCell>
                              {result.scenarios.map((s) => (
                                <TableCell key={s.price} className={`text-right tabular-nums ${Number(s.profit) < 0 ? "text-destructive" : ""}`}>
                                  {formatBRL(s.profit)} ({formatPercent(s.margin)})
                                </TableCell>
                              ))}
                              <TableCell>
                                <Button variant="ghost" size="sm" asChild>
                                  <Link href={`/app/pricing?${new URLSearchParams({ ...Object.fromEntries(Object.entries(params).filter(([, v]) => v) as [string, string][]), offer: offer.id })}`}>
                                    Detalhar
                                  </Link>
                                </Button>
                              </TableCell>
                            </TableRow>
                          ),
                        )}
                      </TableBody>
                    </Table>
                  </div>

                  {selected && selected.result.status === "complete" ? (
                    <div className="grid gap-4">
                      {selected.result.warnings.length > 0 ? (
                        <ul className="grid gap-1 rounded-lg border border-warning/50 bg-warning/10 p-3 text-sm">
                          {selected.result.warnings.map((w) => (
                            <li key={w} className="flex items-center gap-2">
                              <AlertTriangle className="size-4 shrink-0" aria-hidden /> {w}
                            </li>
                          ))}
                        </ul>
                      ) : null}
                      <div className="grid gap-4 lg:grid-cols-2">
                        {selected.result.atSuggested ? (
                          <div className="grid gap-2">
                            <Breakdown evaluation={selected.result.atSuggested} title={`Preço sugerido para margem de ${formatPercent(profile!.rules.targetMargin)}: ${formatBRL(selected.result.suggestedPrice)}`} />
                            {canSimulate ? (
                              <SaveSimulationButton productId={product.id} offerId={selected.offer.id} profileId={profile!.id} label="Registrar simulação do preço sugerido" />
                            ) : null}
                          </div>
                        ) : null}
                        {selected.result.scenarios.map((s, i) => (
                          <div key={s.price} className="grid gap-2">
                            <Breakdown evaluation={s} title={`Cenário ${i + 1}: ${formatBRL(s.price)}`} />
                            {canSimulate ? (
                              <SaveSimulationButton productId={product.id} offerId={selected.offer.id} profileId={profile!.id} price={s.price} label={`Registrar cenário ${i + 1}`} />
                            ) : null}
                          </div>
                        ))}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Perfil “{profile!.name}”, versão {profile!.version} de {formatDateTime(profile!.effectiveAt)}. Tarifas:{" "}
                        {profile!.rules.feeReference ?? "fonte não informada"}
                        {profile!.rules.feeReferenceDate ? ` (consulta em ${formatDate(profile!.rules.feeReferenceDate)})` : ""}. Custo do fornecedor atualizado em{" "}
                        {formatDateTime(selected.offer.cost_updated_at)}. Tributos são estimativas e não substituem apuração fiscal.
                      </p>
                    </div>
                  ) : null}
                </>
              )}
            </CardContent>
          </Card>
        )}

        {history && history.length > 0 ? (
          <Card>
            <CardHeader>
              <CardTitle>Histórico de simulações</CardTitle>
              <CardDescription>Cada registro guarda os parâmetros e a versão de cálculo usados.</CardDescription>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Produto</TableHead>
                    <TableHead className="text-right">Preço</TableHead>
                    <TableHead className="text-right">Lucro</TableHead>
                    <TableHead className="text-right">Margem</TableHead>
                    <TableHead className="text-right">Mínimo</TableHead>
                    <TableHead>Data</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {history.map((h) => (
                    <TableRow key={h.id}>
                      <TableCell>
                        {h.product?.title} <span className="font-mono text-xs text-muted-foreground">{h.offer?.sku}</span>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{formatBRL(h.selling_price)}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatBRL(h.estimated_profit)}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatPercent(h.estimated_margin)}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatBRL(h.break_even_price)}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {formatDateTime(h.created_at)} <StatusBadge>v{h.calculation_version}</StatusBadge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        ) : null}

        {canConfigure ? (
          <>
            {profiles.map((p) => (
              <Card key={p.id}>
                <CardHeader>
                  <CardTitle className="text-base">
                    Perfil: {p.name} {p.isDefault ? <StatusBadge tone="info">padrão</StatusBadge> : null}
                  </CardTitle>
                  <CardDescription>Versão {p.version} vigente desde {formatDateTime(p.effectiveAt)}. Salvar cria uma nova versão; as anteriores ficam no histórico.</CardDescription>
                </CardHeader>
                <CardContent>
                  <PricingProfileForm profile={p} />
                </CardContent>
              </Card>
            ))}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Novo perfil de preço</CardTitle>
                <CardDescription>Use perfis diferentes por tipo de anúncio, categoria ou estratégia de margem.</CardDescription>
              </CardHeader>
              <CardContent>
                <PricingProfileForm />
              </CardContent>
            </Card>
          </>
        ) : null}
      </div>
    </>
  );
}
