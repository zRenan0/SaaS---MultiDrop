"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { asJson, numeric } from "@/lib/db-values";
import { parseBrlAmount } from "@/lib/money";
import { logger } from "@/lib/logging/logger";
import { formDataToObject, parseInput, runAction } from "@/server/action";
import { audit } from "@/server/audit";
import { describeDbError, type ActionResult } from "@/server/errors";
import { requirePermission } from "@/server/session";
import { uuidSchema } from "@/features/organizations/schemas";
import { recordIntegrationError } from "@/features/marketplace/accounts";
import { buildItemPayload, EMPTY_GTIN_REASON, mlCausesToIssues, pickShippingMode, type ShippingMode, requiredAttributesFromCategory, validateDraftLocally, ML_TITLE_MAX, type DraftAttribute, type ValidationIssue } from "@/features/listings/payload";
import { draftForPayload, loadDraftContext, productPictures, samePictures, validatedPictures, type DraftContext } from "@/features/listings/service";
import { mlClientForAccount } from "@/server/integrations/mercado-livre/factory";
import { MlApiError } from "@/server/integrations/mercado-livre/http";
import { ReauthorizationRequiredError } from "@/server/integrations/mercado-livre/token-manager";
import { calculate } from "@/features/pricing/engine";
import { loadProfiles } from "@/features/pricing/service";

/** Modo de envio da conta. Sem resposta da API assume ME2, que é o padrão exigido no Brasil. */
async function shippingModeFor(client: ReturnType<typeof mlClientForAccount>, userId: string): Promise<{ mode: ShippingMode | null; modes: string[] | null }> {
  try {
    const prefs = await client.getShippingPreferences(userId);
    return { mode: pickShippingMode(prefs.modes), modes: prefs.modes };
  } catch (error) {
    logger.warn("ml_shipping_preferences_failed", { error });
    return { mode: "me2", modes: null };
  }
}

function mlErrorMessage(error: unknown): string {
  if (error instanceof ReauthorizationRequiredError) return error.message;
  if (error instanceof MlApiError) return `Mercado Livre respondeu ${error.status || "sem resposta"}: ${error.message}`;
  return "Falha ao comunicar com o Mercado Livre.";
}

export async function createDraftAction(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  let draftId: string | null = null;
  const result = await runAction("listings.create_draft", async () => {
    const ctx = await requirePermission("listings.write");
    const input = parseInput(
      z.object({ productId: z.uuid(), offerId: z.uuid("Selecione a oferta."), accountId: z.uuid().optional().or(z.literal("").transform(() => undefined)) }),
      formDataToObject(formData),
    );
    const supabase = await createClient();
    const org = ctx.organization.id;
    const [{ data: product }, { data: offer }, profiles] = await Promise.all([
      supabase.from("catalog_products").select("id, title, images, brand, model, gtin").eq("id", input.productId).eq("organization_id", org).maybeSingle(),
      supabase
        .from("supplier_offers")
        .select("id, available_stock, supplier_cost, inbound_shipping_cost, supplier_handling_fee, cost_updated_at")
        .eq("id", input.offerId)
        .eq("catalog_product_id", input.productId)
        .eq("organization_id", org)
        .maybeSingle(),
      loadProfiles(supabase, org),
    ]);
    if (!product || !offer) return { ok: false, error: "Produto ou oferta não encontrado." };

    // Preço inicial: sugerido pelo perfil padrão quando o cálculo está completo; senão fica em branco.
    const profile = profiles.find((p) => p.isDefault) ?? profiles[0];
    let price: string | null = null;
    if (profile) {
      const calc = calculate(
        { supplierCost: String(offer.supplier_cost), inboundShippingCost: String(offer.inbound_shipping_cost), supplierHandlingFee: String(offer.supplier_handling_fee), costUpdatedAt: offer.cost_updated_at },
        profile.rules,
      );
      if (calc.status === "complete") price = calc.suggestedPrice;
    }
    const images = (Array.isArray(product.images) ? product.images : []) as { url: string; authorized?: boolean }[];
    const attributes: DraftAttribute[] = [
      ...(product.brand ? [{ id: "BRAND", name: "Marca", value_name: product.brand }] : []),
      ...(product.model ? [{ id: "MODEL", name: "Modelo", value_name: product.model }] : []),
      ...(product.gtin ? [{ id: "GTIN", name: "Código universal de produto", value_name: product.gtin }] : []),
    ];
    const name = product.title.slice(0, ML_TITLE_MAX);
    const { data, error } = await supabase
      .from("listing_drafts")
      .insert({
        organization_id: org,
        catalog_product_id: product.id,
        supplier_offer_id: offer.id,
        marketplace_account_id: input.accountId ?? null,
        title: name,
        family_name: name,
        listing_type_id: profile?.rules.listingType ?? null,
        attributes: asJson(attributes),
        pictures: asJson(images.map((i) => ({ url: i.url, authorized: Boolean(i.authorized) }))),
        target_price: price === null ? null : numeric(price),
        target_stock: offer.available_stock > 0 ? offer.available_stock : null,
        created_by: ctx.user.id,
      })
      .select("id")
      .single();
    if (error) return { ok: false, error: describeDbError(error) };
    draftId = data.id;
    return { ok: true };
  });
  if (result.ok && draftId) redirect(`/app/listings/${draftId}`);
  return result;
}

const draftUpdateSchema = z.object({
  draftId: z.uuid(),
  accountId: z.uuid().optional().or(z.literal("").transform(() => undefined)),
  title: z.string().trim().max(ML_TITLE_MAX, `Máximo de ${ML_TITLE_MAX} caracteres.`).optional(),
  familyName: z.string().trim().max(ML_TITLE_MAX, `Máximo de ${ML_TITLE_MAX} caracteres.`).optional(),
  categoryId: z
    .string()
    .trim()
    .toUpperCase()
    .optional()
    .refine((v) => !v || /^[A-Z]{3}\d+$/.test(v), "Categoria inválida (ex.: MLB1234)."),
  listingTypeId: z.string().trim().regex(/^[a-z_]*$/, "Tipo de anúncio inválido.").max(40).optional(),
  condition: z.enum(["new", "used", "not_specified"]),
  price: z.string().optional(),
  stock: z.string().optional(),
  description: z.string().max(50000).optional(),
});

export async function updateDraftAction(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  return runAction("listings.update_draft", async (): Promise<ActionResult> => {
    const ctx = await requirePermission("listings.write");
    const raw = formDataToObject(formData);
    const input = parseInput(draftUpdateSchema, raw);
    const price = input.price ? parseBrlAmount(input.price) : null;
    if (input.price && (!price || price.lessThanOrEqualTo(0))) return { ok: false, error: "Preço inválido.", fieldErrors: { price: ["Preço inválido."] } };
    const stock = input.stock ? Number(input.stock) : null;
    if (input.stock && (!Number.isInteger(stock) || stock! < 0 || stock! > 99999)) return { ok: false, error: "Estoque inválido.", fieldErrors: { stock: ["Estoque inválido."] } };

    const attributes: DraftAttribute[] = [];
    for (const [key, value] of Object.entries(raw)) {
      const m = /^attr(v?)__([A-Z0-9_]{1,60})$/.exec(key);
      if (!m || !value.trim()) continue;
      const name = raw[`attrname__${m[2]}`]?.slice(0, 120);
      attributes.push(m[1] ? { id: m[2], name, value_id: value.trim().slice(0, 60) } : { id: m[2], name, value_name: value.trim().slice(0, 255) });
    }
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("listing_drafts")
      .update({
        marketplace_account_id: input.accountId ?? null,
        title: input.title || null,
        family_name: input.familyName || null,
        category_id: input.categoryId || null,
        listing_type_id: input.listingTypeId || null,
        condition: input.condition,
        target_price: price ? numeric(price.toDecimalPlaces(2).toFixed(2)) : null,
        target_stock: stock,
        description: input.description || null,
        attributes: asJson(attributes),
      })
      .eq("id", input.draftId)
      .eq("organization_id", ctx.organization.id)
      .select("id");
    if (error) return { ok: false, error: describeDbError(error) };
    if (!data?.length) return { ok: false, error: "Rascunho não encontrado." };
    revalidatePath(`/app/listings/${input.draftId}`);
    return { ok: true, message: "Rascunho salvo. Valide novamente antes de publicar." };
  });
}

export async function predictCategoryAction(draftId: string, query: string): Promise<ActionResult<{ id: string; name: string }[]>> {
  return runAction<{ id: string; name: string }[]>("listings.predict_category", async () => {
    const ctx = await requirePermission("listings.write");
    const draft = await loadDraftContext(parseInput(uuidSchema, draftId), ctx.organization.id);
    if (!draft.account || draft.account.status !== "active") return { ok: false, error: "Selecione e salve uma conta do Mercado Livre ativa." };
    try {
      const suggestions = await mlClientForAccount(draft.account.id, draft.account.site_id).predictCategory(query || draft.product?.title || "");
      return { ok: true, data: suggestions.map((s) => ({ id: s.category_id, name: `${s.category_name}${s.domain_name ? ` (${s.domain_name})` : ""}` })) };
    } catch (error) {
      return { ok: false, error: mlErrorMessage(error) };
    }
  });
}

async function setDraftValidation(draft: DraftContext, status: "validated" | "invalid", issues: ValidationIssue[]) {
  const admin = createAdminClient();
  await admin
    .from("listing_drafts")
    .update({
      status,
      validation_errors: asJson(issues),
      validated_at: status === "validated" ? new Date().toISOString() : null,
      // Registra as fotos avaliadas; a publicação exige que continuem as mesmas.
      pictures: asJson(productPictures(draft)),
    })
    .eq("id", draft.id)
    .eq("version", draft.version);
}

export async function validateDraftAction(formData: FormData): Promise<ActionResult> {
  return runAction("listings.validate", async () => {
    const ctx = await requirePermission("listings.write");
    const draft = await loadDraftContext(parseInput(uuidSchema, formData.get("draftId")), ctx.organization.id);
    if (draft.status === "published" || draft.status === "publishing") return { ok: false, error: "Rascunho já publicado ou em publicação." };
    const payloadDraft = draftForPayload(draft);
    let requiredAttributes = null;
    const client = draft.account && draft.account.status === "active" ? mlClientForAccount(draft.account.id, draft.account.site_id) : null;
    if (client && draft.category_id) {
      try {
        requiredAttributes = requiredAttributesFromCategory(await client.getCategoryAttributes(draft.category_id));
      } catch (error) {
        logger.warn("ml_category_attributes_failed", { draftId: draft.id, error });
      }
    }
    const issues = validateDraftLocally(payloadDraft, {
      hasAccount: Boolean(draft.account),
      accountActive: draft.account?.status === "active",
      userProductSeller: draft.account?.user_product_seller ?? null,
      offerStatus: draft.offer?.status ?? null,
      offerStock: draft.offer?.available_stock ?? null,
      requiredAttributes,
    });
    if (issues.length > 0 || !client) {
      await setDraftValidation(draft, "invalid", issues);
      revalidatePath(`/app/listings/${draft.id}`);
      return { ok: false, error: `Corrija ${issues.length} problema(s) antes da validação oficial.` };
    }
    const shipping = await shippingModeFor(client, draft.account!.external_account_id);
    if (!shipping.mode) {
      const issue = { field: "shipping", message: "A conta do Mercado Livre não tem nenhum modo de envio ativo. Ative o Mercado Envios em Configurações de vendas > Envios.", source: "local" as const };
      await setDraftValidation(draft, "invalid", [issue]);
      revalidatePath(`/app/listings/${draft.id}`);
      return { ok: false, error: issue.message };
    }
    try {
      await client.validateItem(
        buildItemPayload(payloadDraft, { userProductSeller: Boolean(draft.account!.user_product_seller), currencyId: "BRL", shippingMode: shipping.mode }),
      );
    } catch (error) {
      if (error instanceof MlApiError && error.status >= 400 && error.status < 500 && !error.isAuthError) {
        logger.warn("ml_validate_rejected", { draftId: draft.id, status: error.status, errorCode: error.code, causes: error.causes });
        await setDraftValidation(draft, "invalid", mlCausesToIssues(error.causes, error.message, payloadDraft.attributes.some((a) => a.id === EMPTY_GTIN_REASON), error.code));
        revalidatePath(`/app/listings/${draft.id}`);
        return { ok: false, error: "O Mercado Livre apontou problemas no anúncio. Veja a lista e corrija." };
      }
      return { ok: false, error: mlErrorMessage(error) };
    }
    await setDraftValidation(draft, "validated", []);
    revalidatePath(`/app/listings/${draft.id}`);
    return { ok: true, message: "Anúncio validado pelo Mercado Livre (nada foi publicado)." };
  });
}

/** Publicação real. Exige papel admin, validação prévia, confirmação explícita e transição atômica validated → publishing. */
export async function publishDraftAction(formData: FormData): Promise<ActionResult> {
  return runAction("listings.publish", async () => {
    const ctx = await requirePermission("listings.publish");
    const input = parseInput(z.object({ draftId: z.uuid(), confirm: z.literal("PUBLICAR", "Digite PUBLICAR para confirmar.") }), formDataToObject(formData));
    const draft = await loadDraftContext(input.draftId, ctx.organization.id);
    if (draft.status !== "validated") return { ok: false, error: "Valide o rascunho antes de publicar." };
    if (!draft.account || draft.account.status !== "active") return { ok: false, error: "Conta do Mercado Livre inativa." };
    if (!draft.offer || draft.offer.available_stock < (draft.target_stock ?? 1)) return { ok: false, error: "Estoque do fornecedor insuficiente. Atualize a oferta." };
    if (!samePictures(productPictures(draft), validatedPictures(draft))) return { ok: false, error: "As fotos do produto mudaram depois da validação. Valide novamente." };

    const admin = createAdminClient();
    const { data: locked } = await admin
      .from("listing_drafts")
      .update({ status: "publishing", last_error: null })
      .eq("id", draft.id)
      .eq("status", "validated")
      .eq("version", draft.version)
      .select("id");
    if (!locked?.length) return { ok: false, error: "O rascunho foi alterado ou já está sendo publicado. Recarregue a página." };

    const payloadDraft = draftForPayload(draft);
    const client = mlClientForAccount(draft.account.id, draft.account.site_id);
    const shipping = await shippingModeFor(client, draft.account.external_account_id);
    const payload = buildItemPayload(payloadDraft, { userProductSeller: Boolean(draft.account.user_product_seller), currencyId: "BRL", shippingMode: shipping.mode });
    let item;
    try {
      item = await client.createItem(payload);
    } catch (error) {
      const ambiguous = !(error instanceof MlApiError) || error.status === 0 || error.status >= 500;
      if (ambiguous && payloadDraft.sellerSku) {
        // Resultado incerto (timeout/5xx): verifica se o anúncio foi criado antes de marcar falha.
        try {
          const found = await client.findItemsBySellerSku(draft.account.external_account_id, payloadDraft.sellerSku);
          if (found.length === 1) item = await client.getItem(found[0]);
        } catch (lookupError) {
          logger.warn("ml_publish_reconcile_failed", { draftId: draft.id, error: lookupError });
        }
      }
      if (!item) {
        const message = ambiguous
          ? `${mlErrorMessage(error)} O resultado é incerto: confira no Mercado Livre se o anúncio foi criado antes de tentar de novo.`
          : mlErrorMessage(error);
        await admin
          .from("listing_drafts")
          .update({
            status: "failed",
            last_error: message,
            validation_errors: asJson(error instanceof MlApiError ? mlCausesToIssues(error.causes, error.message, false, error.code) : []),
          })
          .eq("id", draft.id);
        await recordIntegrationError({ organizationId: ctx.organization.id, entityType: "listing_draft", entityId: draft.id, code: error instanceof MlApiError ? error.code : "publish_failed", message, retryable: ambiguous });
        revalidatePath(`/app/listings/${draft.id}`);
        return { ok: false, error: message };
      }
    }

    const { data: listing, error: listingError } = await admin
      .from("marketplace_listings")
      .upsert(
        {
          organization_id: ctx.organization.id,
          marketplace_account_id: draft.account.id,
          catalog_product_id: draft.catalog_product_id,
          supplier_offer_id: draft.supplier_offer_id,
          listing_draft_id: draft.id,
          external_item_id: item.id,
          external_user_product_id: item.user_product_id ?? null,
          family_name: item.family_name ?? null,
          title: item.title ?? null,
          status: item.status,
          price: item.price ?? null,
          available_stock: item.available_quantity ?? null,
          permalink: item.permalink ?? null,
          last_synced_at: new Date().toISOString(),
          raw: asJson(item),
        },
        { onConflict: "marketplace_account_id,external_item_id" },
      )
      .select("id")
      .single();
    if (listingError) {
      logger.error("listing_record_failed", { draftId: draft.id, itemId: item.id, error: listingError });
      await admin.from("listing_drafts").update({ status: "published", last_error: `Publicado como ${item.id}, mas houve falha ao registrar localmente.` }).eq("id", draft.id);
      return { ok: false, error: `Anúncio ${item.id} publicado, mas não foi possível registrá-lo localmente: ${describeDbError(listingError)}` };
    }
    await admin.from("listing_drafts").update({ status: "published", published_listing_id: listing.id }).eq("id", draft.id);

    if (draft.description?.trim()) {
      try {
        await client.setDescription(item.id, draft.description);
      } catch (error) {
        await recordIntegrationError({ organizationId: ctx.organization.id, entityType: "marketplace_listing", entityId: listing.id, code: "description_failed", message: mlErrorMessage(error), retryable: true });
      }
    }
    await audit({ organizationId: ctx.organization.id, actorUserId: ctx.user.id, action: "listing.publish", entityType: "marketplace_listing", entityId: listing.id, metadata: { external_item_id: item.id, status: item.status } });
    revalidatePath("/app/listings");
    revalidatePath(`/app/listings/${draft.id}`);
    return { ok: true, message: `Anúncio ${item.id} criado no Mercado Livre com status "${item.status}".` };
  });
}

export async function retryDraftAction(formData: FormData): Promise<ActionResult> {
  return runAction("listings.retry", async () => {
    const ctx = await requirePermission("listings.publish");
    const draftId = parseInput(uuidSchema, formData.get("draftId"));
    const admin = createAdminClient();
    const draft = await loadDraftContext(draftId, ctx.organization.id);
    if (draft.status !== "failed") return { ok: false, error: "Somente rascunhos com falha podem voltar para edição." };
    await admin.from("listing_drafts").update({ status: "draft", validated_at: null }).eq("id", draft.id).eq("status", "failed");
    revalidatePath(`/app/listings/${draft.id}`);
    return { ok: true, message: "Rascunho liberado para correção." };
  });
}

/** Consulta o estado real do anúncio no Mercado Livre e atualiza o registro local. */
export async function refreshListingAction(formData: FormData): Promise<ActionResult> {
  return runAction("listings.refresh", async () => {
    const ctx = await requirePermission("listings.write");
    const listingId = parseInput(uuidSchema, formData.get("listingId"));
    const supabase = await createClient();
    const { data: listing } = await supabase
      .from("marketplace_listings")
      .select("id, external_item_id, account:marketplace_accounts(id, site_id, status)")
      .eq("id", listingId)
      .eq("organization_id", ctx.organization.id)
      .maybeSingle();
    if (!listing?.account) return { ok: false, error: "Anúncio não encontrado." };
    try {
      const item = await mlClientForAccount(listing.account.id, listing.account.site_id).getItem(listing.external_item_id);
      await createAdminClient()
        .from("marketplace_listings")
        .update({
          status: item.status,
          price: item.price ?? null,
          available_stock: item.available_quantity ?? null,
          permalink: item.permalink ?? null,
          external_user_product_id: item.user_product_id ?? null,
          family_name: item.family_name ?? null,
          title: item.title ?? null,
          last_synced_at: new Date().toISOString(),
          raw: asJson(item),
        })
        .eq("id", listing.id);
      revalidatePath("/app/listings");
      return { ok: true, message: `Status atual no Mercado Livre: ${item.status}.` };
    } catch (error) {
      return { ok: false, error: mlErrorMessage(error) };
    }
  });
}

/** Busca a tarifa oficial para preço/categoria/tipo e registra com fonte e data. */
export async function fetchOfficialFeeAction(formData: FormData): Promise<ActionResult> {
  return runAction("listings.official_fee", async () => {
    const ctx = await requirePermission("listings.write");
    const draft = await loadDraftContext(parseInput(uuidSchema, formData.get("draftId")), ctx.organization.id);
    if (!draft.account || draft.account.status !== "active" || !draft.category_id || !draft.listing_type_id || !draft.target_price) {
      return { ok: false, error: "Defina conta ativa, categoria, tipo de anúncio e preço antes de consultar a tarifa." };
    }
    try {
      const fee = await mlClientForAccount(draft.account.id, draft.account.site_id).getListingPrice({
        price: String(draft.target_price),
        listingTypeId: draft.listing_type_id,
        categoryId: draft.category_id,
      });
      if (!fee || fee.sale_fee_amount == null) return { ok: false, error: "O Mercado Livre não retornou a tarifa para estes parâmetros." };
      const price = Number(draft.target_price);
      const fixed = fee.sale_fee_details?.fixed_fee ?? 0;
      const percentage = fee.sale_fee_details?.percentage_fee;
      const rate = percentage != null ? percentage / 100 : Math.max(0, (fee.sale_fee_amount - fixed) / price);
      const { error } = await createAdminClient().from("marketplace_fee_snapshots").insert({
        organization_id: null,
        marketplace: "mercado_livre",
        site_id: draft.account.site_id,
        category_id: draft.category_id,
        listing_type: draft.listing_type_id,
        price_min: numeric(String(draft.target_price)),
        price_max: numeric(String(draft.target_price)),
        fixed_fee: numeric(fixed.toFixed(2)),
        variable_fee_rate: numeric(rate.toFixed(6)),
        source: "ml_api_listing_prices",
        raw: asJson(fee),
      });
      if (error) return { ok: false, error: describeDbError(error) };
      revalidatePath(`/app/listings/${draft.id}`);
      return { ok: true, message: `Tarifa oficial registrada: R$ ${fee.sale_fee_amount.toFixed(2).replace(".", ",")} por venda neste preço.` };
    } catch (error) {
      return { ok: false, error: mlErrorMessage(error) };
    }
  });
}

export async function deleteDraftAction(formData: FormData): Promise<ActionResult> {
  const result = await runAction("listings.delete_draft", async () => {
    const ctx = await requirePermission("listings.write");
    const draftId = parseInput(uuidSchema, formData.get("draftId"));
    const supabase = await createClient();
    const { data, error } = await supabase.from("listing_drafts").delete().eq("id", draftId).eq("organization_id", ctx.organization.id).select("id");
    if (error || !data?.length) return { ok: false, error: describeDbError(error, "Rascunho não pode ser excluído (publicado ou inexistente).") };
    return { ok: true };
  });
  if (result.ok) redirect("/app/listings");
  return result;
}
