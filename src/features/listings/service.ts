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

/** Imagens atuais do produto, no formato do anúncio. O rascunho sempre usa as fotos do produto (sem cópia desatualizada). */
export function productPictures(draft: DraftContext): DraftPicture[] {
  const images = (Array.isArray(draft.product?.images) ? draft.product.images : []) as { url?: string; authorized?: boolean }[];
  return images.filter((i): i is { url: string; authorized?: boolean } => typeof i.url === "string").map((i) => ({ url: i.url, authorized: Boolean(i.authorized) }));
}

/** Fotos registradas na última validação (as que o Mercado Livre aprovou). */
export function validatedPictures(draft: DraftContext): DraftPicture[] {
  return (Array.isArray(draft.pictures) ? draft.pictures : []) as DraftPicture[];
}

export function samePictures(a: DraftPicture[], b: DraftPicture[]) {
  return a.length === b.length && a.every((p, i) => p.url === b[i].url && p.authorized === b[i].authorized);
}

export function draftForPayload(draft: DraftContext): DraftForPayload {
  return {
    title: draft.title,
    familyName: draft.family_name,
    categoryId: draft.category_id,
    listingTypeId: draft.listing_type_id,
    condition: draft.condition as DraftForPayload["condition"],
    attributes: (Array.isArray(draft.attributes) ? draft.attributes : []) as DraftAttribute[],
    pictures: productPictures(draft),
    price: draft.target_price === null ? null : String(draft.target_price),
    stock: draft.target_stock,
    sellerSku: draft.offer?.sku ?? null,
  };
}
