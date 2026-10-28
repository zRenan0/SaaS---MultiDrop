"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { asJson } from "@/lib/db-values";
import { parseInput, runAction } from "@/server/action";
import { audit } from "@/server/audit";
import { describeDbError, type ActionResult } from "@/server/errors";
import { requirePermission } from "@/server/session";
import { PRODUCT_IMAGE_BUCKET, PRODUCT_IMAGE_MAX_BYTES, PRODUCT_IMAGE_MAX_COUNT, PRODUCT_IMAGE_TYPES, type ProductImage } from "@/features/catalog/images";

const uploadRequestSchema = z.object({
  productId: z.uuid(),
  contentType: z.enum(Object.keys(PRODUCT_IMAGE_TYPES) as [keyof typeof PRODUCT_IMAGE_TYPES], "Use imagens JPG, PNG ou WEBP."),
  size: z.number().int().positive().max(PRODUCT_IMAGE_MAX_BYTES, "Cada imagem pode ter no máximo 10 MB."),
});

const attachSchema = z.object({
  productId: z.uuid(),
  path: z.string().min(10).max(300),
  authorized: z.boolean(),
});

const removeSchema = z.object({ productId: z.uuid(), url: z.url() });

function asImages(value: unknown): ProductImage[] {
  return (Array.isArray(value) ? value : []) as ProductImage[];
}

async function loadProduct(productId: string, organizationId: string) {
  const supabase = await createClient();
  const { data } = await supabase.from("catalog_products").select("id, images").eq("id", productId).eq("organization_id", organizationId).maybeSingle();
  return { supabase, product: data };
}

/** Passo 1: o servidor confere permissão e limites e devolve uma URL assinada de envio (válida por 2 horas, uso único). */
export async function requestProductImageUploadAction(input: z.input<typeof uploadRequestSchema>): Promise<ActionResult<{ path: string; signedUrl: string }>> {
  return runAction("catalog.image_upload_url", async () => {
    const ctx = await requirePermission("catalog.write");
    const data = parseInput(uploadRequestSchema, input);
    const { product } = await loadProduct(data.productId, ctx.organization.id);
    if (!product) return { ok: false, error: "Produto não encontrado." };
    if (asImages(product.images).length >= PRODUCT_IMAGE_MAX_COUNT) return { ok: false, error: `O produto já tem o máximo de ${PRODUCT_IMAGE_MAX_COUNT} imagens.` };
    const path = `${ctx.organization.id}/${product.id}/${randomUUID()}.${PRODUCT_IMAGE_TYPES[data.contentType]}`;
    const { data: signed, error } = await createAdminClient().storage.from(PRODUCT_IMAGE_BUCKET).createSignedUploadUrl(path);
    if (error || !signed) throw error ?? new Error("signed upload url vazio");
    return { ok: true, data: { path, signedUrl: signed.signedUrl } };
  });
}

/** Passo 2: depois do envio, confirma que o arquivo existe no caminho da organização/produto e registra no produto. */
export async function attachProductImageAction(input: z.input<typeof attachSchema>): Promise<ActionResult> {
  return runAction("catalog.image_attach", async () => {
    const ctx = await requirePermission("catalog.write");
    const data = parseInput(attachSchema, input);
    const prefix = `${ctx.organization.id}/${data.productId}/`;
    const fileName = data.path.slice(prefix.length);
    if (!data.path.startsWith(prefix) || !/^[0-9a-f-]{36}\.(jpg|png|webp)$/.test(fileName)) return { ok: false, error: "Arquivo inválido." };

    const admin = createAdminClient();
    const { data: listed, error: listError } = await admin.storage.from(PRODUCT_IMAGE_BUCKET).list(prefix.slice(0, -1), { search: fileName, limit: 1 });
    if (listError) throw listError;
    if (!listed?.some((f) => f.name === fileName)) return { ok: false, error: "O envio da imagem não foi concluído. Tente de novo." };

    const { supabase, product } = await loadProduct(data.productId, ctx.organization.id);
    if (!product) return { ok: false, error: "Produto não encontrado." };
    const images = asImages(product.images);
    if (images.length >= PRODUCT_IMAGE_MAX_COUNT) {
      await admin.storage.from(PRODUCT_IMAGE_BUCKET).remove([data.path]);
      return { ok: false, error: `O produto já tem o máximo de ${PRODUCT_IMAGE_MAX_COUNT} imagens.` };
    }
    const url = admin.storage.from(PRODUCT_IMAGE_BUCKET).getPublicUrl(data.path).data.publicUrl;
    const next: ProductImage[] = [...images, { url, authorized: data.authorized, source: "upload", path: data.path }];
    const { error } = await supabase.from("catalog_products").update({ images: asJson(next) }).eq("id", product.id).eq("organization_id", ctx.organization.id);
    if (error) return { ok: false, error: describeDbError(error) };
    await audit({ organizationId: ctx.organization.id, actorUserId: ctx.user.id, action: "catalog.image_added", entityType: "catalog_product", entityId: product.id, metadata: { path: data.path } });
    revalidatePath(`/app/products/${product.id}`);
    return { ok: true, message: "Imagem adicionada." };
  });
}

export async function removeProductImageAction(formData: FormData): Promise<ActionResult> {
  return runAction("catalog.image_remove", async () => {
    const ctx = await requirePermission("catalog.write");
    const data = parseInput(removeSchema, { productId: formData.get("productId"), url: formData.get("url") });
    const { supabase, product } = await loadProduct(data.productId, ctx.organization.id);
    if (!product) return { ok: false, error: "Produto não encontrado." };
    const images = asImages(product.images);
    const target = images.find((i) => i.url === data.url);
    if (!target) return { ok: false, error: "Imagem não encontrada." };
    const { error } = await supabase
      .from("catalog_products")
      .update({ images: asJson(images.filter((i) => i.url !== data.url)) })
      .eq("id", product.id)
      .eq("organization_id", ctx.organization.id);
    if (error) return { ok: false, error: describeDbError(error) };
    // Só apaga do Storage arquivos enviados por esta organização para este produto.
    if (target.path?.startsWith(`${ctx.organization.id}/${product.id}/`)) {
      await createAdminClient().storage.from(PRODUCT_IMAGE_BUCKET).remove([target.path]);
    }
    await audit({ organizationId: ctx.organization.id, actorUserId: ctx.user.id, action: "catalog.image_removed", entityType: "catalog_product", entityId: product.id });
    revalidatePath(`/app/products/${product.id}`);
    return { ok: true, message: "Imagem removida." };
  });
}
