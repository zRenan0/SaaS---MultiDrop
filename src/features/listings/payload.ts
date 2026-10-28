import { isSafePublicUrl, isValidGtin } from "@/features/catalog/normalize";
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

/** `alternatives`: o requisito também é atendido por um destes atributos (ex.: GTIN ou o motivo de não ter GTIN). */
export type RequiredAttribute = { id: string; name: string; alternatives?: string[] };

/** Atributo do Mercado Livre para informar por que o produto não tem código de barras. */
export const EMPTY_GTIN_REASON = "EMPTY_GTIN_REASON";

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

  if (draft.pictures.length === 0) add("pictures", "Envie ao menos uma foto na seção Fotos.");
  for (const p of draft.pictures) {
    if (!isSafePublicUrl(p.url)) add("pictures", `Imagem com URL inválida: ${p.url.slice(0, 80)}`);
    else if (!p.authorized) add("pictures", "Há fotos com confirmação de uso pendente. Confirme na seção Fotos.");
  }

  if (ctx.requiredAttributes === null) {
    if (draft.categoryId) add("attributes", "Não foi possível consultar os atributos obrigatórios da categoria.");
  } else {
    const filled = (id: string) => {
      const value = draft.attributes.find((a) => a.id === id);
      return Boolean(value && (value.value_name?.trim() || value.value_id));
    };
    for (const attr of ctx.requiredAttributes) {
      if (filled(attr.id) || attr.alternatives?.some(filled)) continue;
      add(
        `attribute:${attr.id}`,
        attr.id === "GTIN" && attr.alternatives?.length
          ? "Informe o código de barras (GTIN/EAN) ou, se o produto não tiver, escolha o motivo em \"Motivo de GTIN vazio\"."
          : `Atributo obrigatório: ${attr.name}.`,
      );
    }
  }
  const gtin = draft.attributes.find((a) => a.id === "GTIN")?.value_name?.trim();
  if (gtin && !isValidGtin(gtin)) add("attribute:GTIN", "Código de barras (GTIN/EAN) inválido: confira os dígitos na embalagem.");
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
export type ShippingMode = "me2" | "me1" | "custom";

/**
 * Modo de envio a declarar no anúncio, a partir dos modos habilitados na conta. ME2 (Mercado Envios) tem prioridade:
 * no Brasil ele é obrigatório para a maioria dos vendedores e o Mercado Livre recusa anúncios sem ele.
 */
export function pickShippingMode(modes: string[]): ShippingMode | null {
  if (modes.includes("me2")) return "me2";
  if (modes.includes("me1")) return "me1";
  if (modes.includes("custom")) return "custom";
  return null;
}

export function buildItemPayload(
  draft: DraftForPayload,
  mode: { userProductSeller: boolean; currencyId: string; shippingMode?: ShippingMode | null },
): Record<string, unknown> {
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
  // Frete grátis obrigatório (quando aplicável) é aplicado pelo próprio Mercado Livre no ME2.
  if (mode.shippingMode) payload.shipping = { mode: mode.shippingMode, local_pick_up: false, free_shipping: false };
  if (mode.userProductSeller) payload.family_name = draft.familyName?.trim();
  else payload.title = draft.title?.trim();
  return payload;
}

/** Converte causas de erro do /items/validate ou /items em problemas exibíveis. */
/** Traduz as mensagens mais comuns do Mercado Livre e diz onde corrigir; as demais seguem como vieram. */
function translateMlMessage(message: string): string {
  if (/ME2 adoption is mandatory|has not mode me1/i.test(message)) {
    return "A conta precisa anunciar com Mercado Envios (ME2). Se este aviso aparecer, a conta não tem o ME2 ativo: ative em Configurações de vendas > Envios no Mercado Livre.";
  }
  const missing = /The attributes \[([^\]]+)\] are required/i.exec(message);
  if (missing) {
    const ids = missing[1].split(",").map((id) => id.trim());
    const parts = ids.map((id) =>
      id === "GTIN" ? 'código de barras (GTIN/EAN); se o produto não tiver, escolha o motivo em "Motivo de GTIN vazio"' : id,
    );
    return `O Mercado Livre exige nesta categoria: ${parts.join("; ")}. Preencha em Atributos da categoria e salve.`;
  }
  return message;
}

const GTIN_REASON_REFUSED =
  "O Mercado Livre não aceitou o motivo de GTIN vazio: a marca informada já tem produtos com código de barras cadastrados, então o GTIN real é obrigatório. Informe o código da embalagem (e apague o motivo) ou, se o produto é de outra marca, corrija a marca.";

/** `sentEmptyGtinReason`: o rascunho enviou o motivo de GTIN vazio (o Mercado Livre o recusa para marcas com GTIN cadastrado). */
export function mlCausesToIssues(
  causes: { code?: string; message?: string; type?: string; cause_id?: number }[],
  fallback: string,
  sentEmptyGtinReason = false,
  errorCode?: string,
): ValidationIssue[] {
  const errors = causes.filter((c) => c.type !== "warning");
  // Sem causas do tipo erro: mostra os avisos (costumam explicar a recusa) e o código devolvido, nunca só "Validation error".
  const relevant = errors.length > 0 ? errors : causes;
  if (relevant.length === 0) {
    const detail = errorCode ? ` (código ${errorCode})` : "";
    return [
      {
        field: "mercado_livre",
        message: `${translateMlMessage(fallback)}${detail}. O Mercado Livre não detalhou o motivo; confira fotos (link público de imagem), categoria, preço e atributos e valide de novo.`,
        source: "mercado_livre",
      },
    ];
  }
  return relevant.map((c) => {
    const message = c.message ?? c.code ?? fallback;
    const gtinRefused = sentEmptyGtinReason && c.code === "item.attribute.missing_conditional_required" && /GTIN/.test(message);
    const text = gtinRefused ? GTIN_REASON_REFUSED : translateMlMessage(message);
    const code = c.code && text === message && !message.includes(c.code) ? ` [${c.code}]` : "";
    return { field: c.code ?? "mercado_livre", message: `${c.type === "warning" ? "Aviso: " : ""}${text}${code}`, source: "mercado_livre" as const };
  });
}

export function requiredAttributesFromCategory(attrs: { id: string; name: string; tags: Record<string, unknown> }[]): RequiredAttribute[] {
  // GTIN costuma vir como conditional_required: obrigatório, a menos que se informe o motivo de não ter código.
  const hasEmptyReason = attrs.some((a) => a.id === EMPTY_GTIN_REASON);
  return attrs
    .filter((a) => a.tags.required === true || a.tags.catalog_required === true || (a.id === "GTIN" && a.tags.conditional_required === true))
    .map((a) => (a.id === "GTIN" && hasEmptyReason ? { id: a.id, name: a.name, alternatives: [EMPTY_GTIN_REASON] } : { id: a.id, name: a.name }));
}
