import { isSafePublicUrl } from "@/features/catalog/normalize";
import { dec } from "@/lib/money";

export type DraftAttribute = { id: string; name?: string; value_name?: string | null; value_id?: string | null };
export type DraftPicture = { url: string; authorized: boolean };

export type DraftForPayload = {
  title: string | null;
  familyName: string | null;
  categoryId: string | null;
  listingTypeId: string | null;
  condition: "new" | "used" | "not_specified";
  attributes: DraftAttribute[];
  pictures: DraftPicture[];
  price: string | null;
  stock: number | null;
  sellerSku: string | null;
};

export type ValidationIssue = { field: string; message: string; source: "local" | "mercado_livre" };

export type RequiredAttribute = { id: string; name: string };

export const ML_TITLE_MAX = 60;

/** Regras locais antes de consultar o Mercado Livre. A validação oficial (/items/validate) é a fonte final. */
export function validateDraftLocally(
  draft: DraftForPayload,
  ctx: {
    hasAccount: boolean;
    accountActive: boolean;
    userProductSeller: boolean | null;
    offerStatus: string | null;
    offerStock: number | null;
    requiredAttributes: RequiredAttribute[] | null;
  },
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const add = (field: string, message: string) => issues.push({ field, message, source: "local" });

  if (!ctx.hasAccount) add("marketplace_account_id", "Selecione a conta do Mercado Livre.");
  else if (!ctx.accountActive) add("marketplace_account_id", "A conta do Mercado Livre não está ativa. Reautorize em Integrações.");
  if (ctx.userProductSeller === null && ctx.hasAccount) add("marketplace_account_id", "Consulte a conta em Integrações para identificar o modelo de publicação (User Products ou clássico).");

  if (ctx.userProductSeller) {
    if (!draft.familyName?.trim()) add("family_name", "Informe o nome da família do produto (obrigatório no modelo User Products).");
  } else if (!draft.title?.trim()) {
    add("title", "Informe o título do anúncio.");
  }
  const name = ctx.userProductSeller ? draft.familyName : draft.title;
  if (name && name.length > ML_TITLE_MAX) add(ctx.userProductSeller ? "family_name" : "title", `Use no máximo ${ML_TITLE_MAX} caracteres.`);

  if (!draft.categoryId) add("category_id", "Selecione a categoria.");
  if (!draft.listingTypeId) add("listing_type_id", "Selecione o tipo de anúncio.");
  if (!draft.price || dec(draft.price).lessThanOrEqualTo(0)) add("target_price", "Informe o preço de venda.");

  if (ctx.offerStatus === null) add("supplier_offer_id", "Selecione a oferta do fornecedor que atenderá o anúncio.");
  else if (ctx.offerStatus !== "active") add("supplier_offer_id", "A oferta do fornecedor não está ativa.");
  if (draft.stock === null || draft.stock <= 0) add("target_stock", "Informe o estoque a anunciar (maior que zero).");
  else if (ctx.offerStock !== null && draft.stock > ctx.offerStock) add("target_stock", `O estoque anunciado (${draft.stock}) excede o disponível no fornecedor (${ctx.offerStock}).`);

  if (draft.pictures.length === 0) add("pictures", "Inclua ao menos uma imagem.");
  for (const p of draft.pictures) {
    if (!isSafePublicUrl(p.url)) add("pictures", `Imagem com URL inválida: ${p.url.slice(0, 80)}`);
    else if (!p.authorized) add("pictures", "Há imagens sem autorização de uso confirmada.");
  }

  if (ctx.requiredAttributes === null) {
    if (draft.categoryId) add("attributes", "Não foi possível consultar os atributos obrigatórios da categoria.");
  } else {
    for (const attr of ctx.requiredAttributes) {
      const value = draft.attributes.find((a) => a.id === attr.id);
      if (!value || (!value.value_name?.trim() && !value.value_id)) add(`attribute:${attr.id}`, `Atributo obrigatório: ${attr.name}.`);
    }
  }
  return dedupe(issues);
}

function dedupe(issues: ValidationIssue[]) {
  const seen = new Set<string>();
  return issues.filter((i) => {
    const key = `${i.field}|${i.message}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * Corpo do POST /items. No modelo User Products envia `family_name` (o título é gerado pelo ML) e não usa `variations`;
 * no modelo clássico envia `title`. O SKU do fornecedor vai no atributo SELLER_SKU para rastreabilidade e reconciliação.
 */
export function buildItemPayload(draft: DraftForPayload, mode: { userProductSeller: boolean; currencyId: string }): Record<string, unknown> {
  const attributes = draft.attributes
    .filter((a) => a.id !== "SELLER_SKU" && (a.value_id || a.value_name?.trim()))
    .map((a) => (a.value_id ? { id: a.id, value_id: a.value_id } : { id: a.id, value_name: a.value_name!.trim() }));
  if (draft.sellerSku) attributes.push({ id: "SELLER_SKU", value_name: draft.sellerSku });

  const payload: Record<string, unknown> = {
    category_id: draft.categoryId,
    price: draft.price ? dec(draft.price).toDecimalPlaces(2).toNumber() : null,
    currency_id: mode.currencyId,
    available_quantity: draft.stock,
    buying_mode: "buy_it_now",
    condition: draft.condition,
    listing_type_id: draft.listingTypeId,
    pictures: draft.pictures.map((p) => ({ source: p.url })),
    attributes,
  };
  if (mode.userProductSeller) payload.family_name = draft.familyName?.trim();
  else payload.title = draft.title?.trim();
  return payload;
}

/** Converte causas de erro do /items/validate ou /items em problemas exibíveis. */
export function mlCausesToIssues(causes: { code?: string; message?: string; type?: string }[], fallback: string): ValidationIssue[] {
  const relevant = causes.filter((c) => c.type !== "warning");
  if (relevant.length === 0) return [{ field: "mercado_livre", message: fallback, source: "mercado_livre" }];
  return relevant.map((c) => ({ field: c.code ?? "mercado_livre", message: c.message ?? c.code ?? fallback, source: "mercado_livre" as const }));
}

export function requiredAttributesFromCategory(attrs: { id: string; name: string; tags: Record<string, unknown> }[]): RequiredAttribute[] {
  return attrs.filter((a) => a.tags.required === true || a.tags.catalog_required === true).map((a) => ({ id: a.id, name: a.name }));
}
