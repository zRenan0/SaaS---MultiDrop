import "server-only";
import type { UserSupabaseClient } from "@/lib/supabase/server";
import { asJson } from "@/lib/db-values";
import { normalizeSku, normalizeTitle } from "@/features/catalog/normalize";
import type { ProductOfferInput } from "@/features/catalog/schemas";

export type UpsertSummary = { createdProducts: number; createdOffers: number; updatedOffers: number };

export function toUpsertRow(input: ProductOfferInput, options: { isExample?: boolean } = {}) {
  return {
    title: input.title,
    normalized_title: normalizeTitle(input.title),
    brand: input.brand ?? null,
    model: input.model ?? null,
    category: input.category ?? null,
    description: input.description ?? null,
    gtin: input.gtin ?? null,
    sku: normalizeSku(input.sku),
    external_offer_id: input.externalOfferId ?? null,
    cost: input.cost,
    inbound_shipping_cost: input.inboundShippingCost,
    handling_fee: input.handlingFee,
    stock: input.stock,
    handling_time_days: input.handlingTimeDays ?? null,
    images: input.imageUrls.map((url) => ({ url, authorized: input.imagesAuthorized, source: "fornecedor" })),
    is_example: options.isExample ?? false,
  };
}

/** Grava produtos/ofertas com o cliente do usuário (RLS e limites de plano aplicados no banco). */
export async function upsertCatalogRows(
  supabase: UserSupabaseClient,
  params: { organizationId: string; connectionId: string; source: "manual" | "file_import"; rows: ReturnType<typeof toUpsertRow>[] },
): Promise<{ data: UpsertSummary | null; error: { code?: string; message?: string; hint?: string | null } | null }> {
  const { data, error } = await supabase.rpc("upsert_catalog_rows", {
    p_organization_id: params.organizationId,
    p_connection_id: params.connectionId,
    p_source: params.source,
    p_rows: asJson(params.rows),
  });
  if (error) return { data: null, error };
  const row = data?.[0];
  return {
    data: { createdProducts: row?.created_products ?? 0, createdOffers: row?.created_offers ?? 0, updatedOffers: row?.updated_offers ?? 0 },
    error: null,
  };
}
