import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertTriangle, ExternalLink } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/layout/page-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { createClient } from "@/lib/supabase/server";
import { formatBRL, formatPercent } from "@/lib/money";
import { formatDateTime } from "@/lib/dates";
import { logger } from "@/lib/logging/logger";
import { isSafePublicUrl } from "@/features/catalog/normalize";
import { DRAFT_STATUS } from "@/features/listings/status";
import { DraftActions, DraftEditor, type CategoryAttributeField } from "@/features/listings/components/draft-forms";
import { draftForPayload, loadDraftContext } from "@/features/listings/service";
import type { ValidationIssue } from "@/features/listings/payload";
import { Breakdown } from "@/features/pricing/components/breakdown";
import { evaluatePrice, type PricingRules } from "@/features/pricing/engine";
import { loadProfiles } from "@/features/pricing/service";
import { can } from "@/features/organizations/roles";
import { NotFoundError } from "@/server/errors";
import { mlClientForAccount } from "@/server/integrations/mercado-livre/factory";
import { requireOrgContext } from "@/server/session";

export const metadata: Metadata = { title: "Rascunho de anúncio" };

export default async function DraftPage({ params }: PageProps<"/app/listings/[id]">) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const ctx = await requireOrgContext();
  let draft;
  try {
    draft = await loadDraftContext(id, ctx.organization.id);
  } catch (error) {
    if (error instanceof NotFoundError) notFound();
    throw error;
  }
  const supabase = await createClient();
  const [{ data: accounts }, profiles, { data: listing }] = await Promise.all([
    supabase.from("marketplace_accounts").select("id, nickname, external_account_id").eq("organization_id", ctx.organization.id).eq("status", "active"),
    loadProfiles(supabase, ctx.organization.id),
    draft.published_listing_id
      ? supabase.from("marketplace_listings").select("external_item_id, permalink, status").eq("id", draft.published_listing_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  // Dados oficiais da categoria (somente com conta ativa). Falhas são exibidas, não ocultadas.
  let attributeFields: CategoryAttributeField[] = [];
  let listingTypes: { id: string; label: string }[] = [];
  let categoryError: string | null = null;
  if (draft.account?.status === "active" && draft.category_id) {
    try {
      const client = mlClientForAccount(draft.account.id, draft.account.site_id);
      const [attributes, types] = await Promise.all([
        client.getCategoryAttributes(draft.category_id),
        client.getAvailableListingTypes(draft.account.external_account_id, draft.category_id),
      ]);
      attributeFields = attributes
        .filter((a) => a.tags.required === true || a.tags.catalog_required === true || ["BRAND", "MODEL", "GTIN"].includes(a.id))
        .filter((a) => !a.tags.read_only && !a.tags.hidden)
        .slice(0, 30)
        .map((a) => ({ id: a.id, name: a.name, required: a.tags.required === true || a.tags.catalog_required === true, values: a.values.slice(0, 200), hint: a.hint }));
      listingTypes = types.available.map((t) => ({ id: t.id, label: `${t.name} (${t.id})` }));
    } catch (error) {
      logger.warn("ml_category_load_failed", { draftId: draft.id, error });
      categoryError = "Não foi possível carregar atributos e tipos de anúncio do Mercado Livre para esta categoria.";
    }
  }

  // Estimativa de lucro com tarifa oficial quando disponível para o mesmo preço, categoria e tipo.
  const profile = profiles.find((p) => p.isDefault) ?? profiles[0];
  let feeNote = "Tarifas do perfil (estimativa configurável).";
  let rules: PricingRules | null = profile?.rules ?? null;
  if (draft.category_id && draft.listing_type_id && draft.target_price) {
    const { data: snapshot } = await supabase
      .from("marketplace_fee_snapshots")
      .select("fixed_fee, variable_fee_rate, retrieved_at")
      .is("organization_id", null)
      .eq("category_id", draft.category_id)
      .eq("listing_type", draft.listing_type_id)
      .eq("price_min", draft.target_price)
      .order("retrieved_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (snapshot) {
      feeNote = `Tarifa oficial do Mercado Livre consultada em ${formatDateTime(snapshot.retrieved_at)} para este preço: ${formatPercent(snapshot.variable_fee_rate)} + ${formatBRL(snapshot.fixed_fee)} fixo. Frete, tributos e demais custos vêm do perfil.`;
      if (rules) {
        rules = {
          ...rules,
          variableFeeRate: String(snapshot.variable_fee_rate),
          fixedFeeBands: [{ upToPrice: null, amount: String(snapshot.fixed_fee) }],
          feeOrigin: "official",
          listingType: draft.listing_type_id,
        };
      }
    }
  }
  const missingRules = rules && (rules.variableFeeRate === null || rules.taxRate === null || rules.shippingBands.length === 0);
  const evaluation =
    rules && !missingRules && draft.offer && draft.target_price
      ? evaluatePrice(
          { supplierCost: String(draft.offer.supplier_cost), inboundShippingCost: String(draft.offer.inbound_shipping_cost), supplierHandlingFee: String(draft.offer.supplier_handling_fee), costUpdatedAt: draft.offer.cost_updated_at },
          rules,
          String(draft.target_price),
        )
      : null;

  const payload = draftForPayload(draft);
  const issues = (Array.isArray(draft.validation_errors) ? draft.validation_errors : []) as ValidationIssue[];
  const [statusLabel, statusTone] = DRAFT_STATUS[draft.status];
  const locked = draft.status === "published" || draft.status === "publishing" || !can(ctx.role, "listings.write");
  const up = draft.account?.user_product_seller ?? null;

  return (
    <>
      <PageHeader
        title={draft.family_name || draft.title || draft.product?.title || "Rascunho"}
        description={
          <>
            <StatusBadge tone={statusTone}>{statusLabel}</StatusBadge> Produto <Link className="underline" href={`/app/products/${draft.catalog_product_id}`}>{draft.product?.title}</Link> · oferta {draft.offer?.connection?.display_name} {draft.offer?.sku} (estoque {draft.offer?.available_stock ?? "—"})
          </>
        }
      />
      <div className="grid gap-6 xl:grid-cols-[1fr_380px]">
        <div className="grid gap-6">
          {listing ? (
            <p role="status" className="flex flex-wrap items-center gap-2 rounded-lg border border-success/40 bg-success/10 p-3 text-sm">
              Publicado como <span className="font-mono">{listing.external_item_id}</span> (status {listing.status})
              {listing.permalink ? (
                <a className="inline-flex items-center gap-1 underline" href={listing.permalink} target="_blank" rel="noopener noreferrer">
                  ver no Mercado Livre <ExternalLink className="size-3" aria-hidden />
                </a>
              ) : null}
            </p>
          ) : null}
          {draft.last_error ? <p role="alert" className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm">{draft.last_error}</p> : null}
          {categoryError ? <p role="alert" className="rounded-lg border border-warning/50 bg-warning/10 p-3 text-sm">{categoryError}</p> : null}
          {issues.length > 0 ? (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <AlertTriangle className="size-4" aria-hidden /> Problemas a corrigir ({issues.length})
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="grid gap-1 text-sm" data-testid="validation-issues">
                  {issues.map((i, n) => (
                    <li key={n}>
                      <StatusBadge tone={i.source === "mercado_livre" ? "danger" : "warning"}>{i.source === "mercado_livre" ? "Mercado Livre" : "Verificação local"}</StatusBadge> {i.message}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          ) : null}
          <Card>
            <CardHeader>
              <CardTitle>Dados do anúncio</CardTitle>
              <CardDescription>
                {up === null
                  ? "Modelo de publicação ainda não identificado: selecione a conta e consulte-a em Integrações."
                  : up
                    ? "Conta no modelo User Products: o Mercado Livre gera o título a partir do nome da família e dos atributos; variações não são enviadas."
                    : "Conta no modelo clássico: o título informado é enviado."}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <DraftEditor
                draft={{
                  id: draft.id,
                  accountId: draft.marketplace_account_id,
                  title: draft.title,
                  familyName: draft.family_name,
                  categoryId: draft.category_id,
                  listingTypeId: draft.listing_type_id,
                  condition: draft.condition,
                  price: draft.target_price === null ? null : String(draft.target_price),
                  stock: draft.target_stock,
                  description: draft.description,
                  attributes: payload.attributes,
                }}
                accounts={(accounts ?? []).map((a) => ({ id: a.id, label: a.nickname ?? a.external_account_id }))}
                listingTypes={listingTypes}
                attributeFields={attributeFields}
                userProductSeller={up}
                locked={locked}
              />
            </CardContent>
          </Card>
        </div>
        <div className="grid content-start gap-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Prévia</CardTitle>
              <CardDescription>Como será enviado ao Mercado Livre.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3 text-sm">
              <div className="grid grid-cols-3 gap-2">
                {payload.pictures.filter((p) => isSafePublicUrl(p.url)).slice(0, 6).map((p) => (
                  <div key={p.url} role="img" aria-label="Imagem do anúncio" className="aspect-square rounded-md border bg-cover bg-center" style={{ backgroundImage: `url("${encodeURI(p.url)}")` }} />
                ))}
              </div>
              {payload.pictures.length === 0 ? <p className="text-destructive">Sem imagens.</p> : null}
              <dl className="grid gap-1">
                <div><dt className="inline text-muted-foreground">{up ? "Família: " : "Título: "}</dt><dd className="inline">{(up ? payload.familyName : payload.title) || "—"}</dd></div>
                <div><dt className="inline text-muted-foreground">Categoria: </dt><dd className="inline">{payload.categoryId ?? "—"}</dd></div>
                <div><dt className="inline text-muted-foreground">Tipo: </dt><dd className="inline">{payload.listingTypeId ?? "—"}</dd></div>
                <div><dt className="inline text-muted-foreground">Preço: </dt><dd className="inline">{formatBRL(payload.price)}</dd></div>
                <div><dt className="inline text-muted-foreground">Estoque: </dt><dd className="inline">{payload.stock ?? "—"}</dd></div>
                <div><dt className="inline text-muted-foreground">SKU: </dt><dd className="inline font-mono">{payload.sellerSku ?? "—"}</dd></div>
              </dl>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Lucro estimado neste preço</CardTitle>
              <CardDescription>{feeNote}</CardDescription>
            </CardHeader>
            <CardContent>
              {evaluation ? (
                <Breakdown evaluation={evaluation} title={`${formatBRL(evaluation.price)} · perfil ${profile?.name}`} />
              ) : (
                <p className="text-sm text-muted-foreground">
                  {!profile ? "Configure um perfil em Precificação." : missingRules ? "O perfil de preço tem parâmetros ausentes." : "Informe o preço."}
                </p>
              )}
            </CardContent>
          </Card>
          {!locked || draft.status === "validated" || draft.status === "failed" ? (
            <Card id="validacao" className="scroll-mt-20">
              <CardHeader>
                <CardTitle className="text-base">Validação e publicação</CardTitle>
                <CardDescription>
                  {draft.validated_at ? `Validado em ${formatDateTime(draft.validated_at)}.` : "Salve as alterações e valide antes de publicar."}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <DraftActions draftId={draft.id} status={draft.status} canPublish={can(ctx.role, "listings.publish")} />
              </CardContent>
            </Card>
          ) : null}
        </div>
      </div>
    </>
  );
}
