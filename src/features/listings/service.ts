import "server-only";
import { createClient } from "@/lib/supabase/server";
import { NotFoundError } from "@/server/errors";
import type { DraftAttribute, DraftForPayload, DraftPicture } from "@/features/listings/payload";

export async function loadDraftContext(draftId: string, organizationId: string) {
  const supabase = await createClient();
  const { data: draft } = await supabase
    .from("listing_drafts")
    .select(
      "*, product:catalog_products(id, title, brand, model, gtin, description, images), offer:supplier_offers(id, sku, status, available_stock, supplier_cost, inbound_shipping_cost, supplier_handling_fee, cost_updated_at, connection:supplier_connections(display_name)), account:marketplace_accounts(id, nickname, status, site_id, external_account_id, user_product_seller)",
    )
    .eq("id", draftId)
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (!draft) throw new NotFoundError("Rascunho não encontrado.");
  return draft;
}

export type DraftContext = Awaited<ReturnType<typeof loadDraftContext>>;

export function draftForPayload(draft: DraftContext): DraftForPayload {
  return {
    title: draft.title,
    familyName: draft.family_name,
    categoryId: draft.category_id,
    listingTypeId: draft.listing_type_id,
    condition: draft.condition as DraftForPayload["condition"],
    attributes: (Array.isArray(draft.attributes) ? draft.attributes : []) as DraftAttribute[],
    pictures: (Array.isArray(draft.pictures) ? draft.pictures : []) as DraftPicture[],
    price: draft.target_price === null ? null : String(draft.target_price),
    stock: draft.target_stock,
    sellerSku: draft.offer?.sku ?? null,
  };
}
