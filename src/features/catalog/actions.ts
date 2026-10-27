"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { formDataToObject, parseInput, runAction } from "@/server/action";
import { audit } from "@/server/audit";
import { describeDbError, type ActionResult } from "@/server/errors";
import { requirePermission } from "@/server/session";
import { createProductSchema, supplierConnectionSchema, updateOfferSchema, productOfferSchema } from "@/features/catalog/schemas";
import { toUpsertRow, upsertCatalogRows } from "@/features/catalog/service";
import { normalizeSku } from "@/features/catalog/normalize";
import { uuidSchema } from "@/features/organizations/schemas";
import { numeric } from "@/lib/db-values";

export async function createSupplierConnectionAction(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  return runAction("suppliers.create", async () => {
    const ctx = await requirePermission("suppliers.manage");
    const input = parseInput(supplierConnectionSchema, formDataToObject(formData));
    const supabase = await createClient();
    const { data: source } = await supabase.from("supplier_sources").select("id, status, adapter_key").eq("id", input.supplierSourceId).maybeSingle();
    if (!source) return { ok: false, error: "Tipo de fornecedor inválido." };
    const { data, error } = await supabase
      .from("supplier_connections")
      .insert({
        organization_id: ctx.organization.id,
        supplier_source_id: input.supplierSourceId,
        display_name: input.displayName,
        // Integrações por API sem configuração verificada nascem pendentes.
        status: source.status === "available" ? "active" : "pending",
        dropship_agreement_confirmed: input.dropshipAgreementConfirmed,
        configuration: {
          contact_name: input.contactName ?? null,
          contact_email: input.contactEmail || null,
          contact_phone: input.contactPhone ?? null,
          website: input.website || null,
          notes: input.notes ?? null,
        },
      })
      .select("id")
      .single();
    if (error) {
      if (error.code === "23505") return { ok: false, error: "Já existe um fornecedor com esse nome.", fieldErrors: { displayName: ["Nome em uso."] } };
      return { ok: false, error: describeDbError(error) };
    }
    await audit({ organizationId: ctx.organization.id, actorUserId: ctx.user.id, action: "supplier_connection.create", entityType: "supplier_connection", entityId: data.id });
    revalidatePath("/app/suppliers");
    return { ok: true, message: "Fornecedor cadastrado." };
  });
}

export async function setSupplierConnectionStatusAction(formData: FormData): Promise<ActionResult> {
  return runAction("suppliers.set_status", async () => {
    const ctx = await requirePermission("suppliers.manage");
    const input = parseInput(z.object({ connectionId: z.uuid(), status: z.enum(["active", "disabled"]) }), formDataToObject(formData));
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("supplier_connections")
      .update({ status: input.status })
      .eq("id", input.connectionId)
      .eq("organization_id", ctx.organization.id)
      .select("id");
    if (error || !data?.length) return { ok: false, error: describeDbError(error, "Fornecedor não encontrado.") };
    await audit({ organizationId: ctx.organization.id, actorUserId: ctx.user.id, action: `supplier_connection.${input.status}`, entityType: "supplier_connection", entityId: input.connectionId });
    revalidatePath("/app/suppliers");
    return { ok: true, message: input.status === "active" ? "Fornecedor ativado." : "Fornecedor desativado." };
  });
}

export async function createProductAction(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  let productId: string | null = null;
  const result = await runAction("catalog.create_product", async () => {
    const ctx = await requirePermission("catalog.write");
    const input = parseInput(createProductSchema, formDataToObject(formData));
    const supabase = await createClient();
    const { data: connection } = await supabase
      .from("supplier_connections")
      .select("id, status")
      .eq("id", input.supplierConnectionId)
      .eq("organization_id", ctx.organization.id)
      .maybeSingle();
    if (!connection) return { ok: false, error: "Fornecedor não encontrado.", fieldErrors: { supplierConnectionId: ["Selecione um fornecedor."] } };
    if (connection.status === "disabled") return { ok: false, error: "Este fornecedor está desativado." };

    const { data, error } = await upsertCatalogRows(supabase, {
      organizationId: ctx.organization.id,
      connectionId: connection.id,
      source: "manual",
      rows: [toUpsertRow(input)],
    });
    if (error || !data) return { ok: false, error: describeDbError(error) };

    const { data: offer } = await supabase
      .from("supplier_offers")
      .select("catalog_product_id")
      .eq("organization_id", ctx.organization.id)
      .eq("supplier_connection_id", connection.id)
      .eq("sku", normalizeSku(input.sku))
      .maybeSingle();
    productId = offer?.catalog_product_id ?? null;
    await audit({ organizationId: ctx.organization.id, actorUserId: ctx.user.id, action: "catalog.manual_upsert", entityType: "catalog_product", entityId: productId, metadata: data });
    return { ok: true };
  });
  if (result.ok) redirect(productId ? `/app/products/${productId}?saved=1` : "/app/products");
  return result;
}

export async function addOfferAction(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  return runAction("catalog.add_offer", async () => {
    const ctx = await requirePermission("catalog.write");
    const raw = formDataToObject(formData);
    const productId = parseInput(uuidSchema, raw.productId);
    const connectionId = parseInput(z.uuid("Selecione o fornecedor."), raw.supplierConnectionId);
    const input = parseInput(
      productOfferSchema.pick({ sku: true, cost: true, inboundShippingCost: true, handlingFee: true, stock: true, handlingTimeDays: true, externalOfferId: true }),
      raw,
    );
    const supabase = await createClient();
    const { error } = await supabase.from("supplier_offers").insert({
      organization_id: ctx.organization.id,
      supplier_connection_id: connectionId,
      // Preenchido pelo trigger a partir da conexão; valor enviado é ignorado.
      supplier_source_id: connectionId,
      catalog_product_id: productId,
      sku: normalizeSku(input.sku),
      external_offer_id: input.externalOfferId ?? null,
      supplier_cost: numeric(input.cost),
      inbound_shipping_cost: numeric(input.inboundShippingCost),
      supplier_handling_fee: numeric(input.handlingFee),
      available_stock: input.stock,
      handling_time_days: input.handlingTimeDays ?? null,
      source: "manual",
      status: input.stock === 0 ? "out_of_stock" : "active",
    });
    if (error) {
      if (error.code === "23505") return { ok: false, error: "Este fornecedor já tem uma oferta com esse SKU." };
      return { ok: false, error: describeDbError(error) };
    }
    revalidatePath(`/app/products/${productId}`);
    return { ok: true, message: "Oferta adicionada." };
  });
}

export async function updateOfferAction(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  return runAction("catalog.update_offer", async () => {
    const ctx = await requirePermission("catalog.write");
    const input = parseInput(updateOfferSchema, formDataToObject(formData));
    const supabase = await createClient();
    // Controle otimista: só atualiza se ninguém (sincronização, outro usuário) alterou a oferta desde a leitura.
    const { data, error } = await supabase
      .from("supplier_offers")
      .update({
        supplier_cost: numeric(input.cost),
        inbound_shipping_cost: numeric(input.inboundShippingCost),
        supplier_handling_fee: numeric(input.handlingFee),
        available_stock: input.stock,
        handling_time_days: input.handlingTimeDays ?? null,
        status: input.status,
        cost_updated_at: new Date().toISOString(),
      })
      .eq("id", input.offerId)
      .eq("organization_id", ctx.organization.id)
      .eq("version", input.version)
      .select("id, catalog_product_id");
    if (error) return { ok: false, error: describeDbError(error) };
    if (!data?.length) return { ok: false, error: "A oferta foi alterada por outra operação. Recarregue a página e tente novamente." };
    revalidatePath(`/app/products/${data[0].catalog_product_id}`);
    return { ok: true, message: "Oferta atualizada." };
  });
}

export async function deleteProductAction(formData: FormData): Promise<ActionResult> {
  const result = await runAction("catalog.delete_product", async () => {
    const ctx = await requirePermission("catalog.delete");
    const productId = parseInput(uuidSchema, formData.get("productId"));
    const supabase = await createClient();
    const { count } = await supabase
      .from("marketplace_listings")
      .select("id", { count: "exact", head: true })
      .eq("catalog_product_id", productId)
      .in("status", ["active", "paused", "under_review"]);
    if ((count ?? 0) > 0) return { ok: false, error: "O produto tem anúncios ativos. Encerre os anúncios antes de excluir." };
    const { data, error } = await supabase.from("catalog_products").delete().eq("id", productId).eq("organization_id", ctx.organization.id).select("id");
    if (error || !data?.length) return { ok: false, error: describeDbError(error, "Produto não encontrado.") };
    await audit({ organizationId: ctx.organization.id, actorUserId: ctx.user.id, action: "catalog.delete_product", entityType: "catalog_product", entityId: productId });
    return { ok: true };
  });
  if (result.ok) redirect("/app/products");
  return result;
}
