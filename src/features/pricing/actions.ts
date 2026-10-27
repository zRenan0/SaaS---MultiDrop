"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { asJson, numeric } from "@/lib/db-values";
import { formDataToObject, parseInput, runAction } from "@/server/action";
import { audit } from "@/server/audit";
import { describeDbError, type ActionResult } from "@/server/errors";
import { requirePermission } from "@/server/session";
import { calculate, CALCULATION_VERSION } from "@/features/pricing/engine";
import { pricingProfileSchema, profileInputToRules } from "@/features/pricing/schemas";
import { loadProfiles } from "@/features/pricing/service";
import { parseBrlAmount } from "@/lib/money";

export async function savePricingProfileAction(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  return runAction("pricing.save_profile", async () => {
    const ctx = await requirePermission("pricing.configure");
    const input = parseInput(pricingProfileSchema, formDataToObject(formData));
    const rules = profileInputToRules(input);
    const supabase = await createClient();
    const org = ctx.organization.id;

    if (input.isDefault) {
      await supabase.from("pricing_profiles").update({ is_default: false }).eq("organization_id", org).eq("is_default", true);
    }
    const profileValues = {
      name: input.name,
      target_margin: numeric(input.targetMargin),
      default_tax_rate: numeric(input.taxRate ?? "0"),
      default_reserve_rate: numeric(input.reserveRate),
      settings: asJson({ listingType: input.listingType }),
      is_default: input.isDefault,
    };
    let profileId = input.profileId;
    if (profileId) {
      const { data, error } = await supabase.from("pricing_profiles").update(profileValues).eq("id", profileId).eq("organization_id", org).select("id");
      if (error || !data?.length) return { ok: false, error: describeDbError(error, "Perfil não encontrado.") };
    } else {
      const { data, error } = await supabase.from("pricing_profiles").insert({ organization_id: org, ...profileValues }).select("id").single();
      if (error) {
        if (error.code === "23505") return { ok: false, error: "Já existe um perfil com esse nome." };
        return { ok: false, error: describeDbError(error) };
      }
      profileId = data.id;
    }
    // Cada alteração gera uma nova versão imutável das regras (o número é atribuído pelo banco).
    const { error: versionError } = await supabase.from("pricing_rule_versions").insert({
      organization_id: org,
      profile_id: profileId,
      rules: asJson(rules),
      created_by: ctx.user.id,
    });
    if (versionError) return { ok: false, error: describeDbError(versionError) };
    await audit({ organizationId: org, actorUserId: ctx.user.id, action: "pricing.profile_saved", entityType: "pricing_profile", entityId: profileId });
    revalidatePath("/app/pricing");
    return { ok: true, message: "Perfil salvo. Uma nova versão das regras foi registrada." };
  });
}

const simulationSchema = z.object({
  productId: z.uuid(),
  offerId: z.uuid(),
  profileId: z.uuid(),
  price: z.string().optional(),
});

/** Recalcula no servidor (não confia em valores do navegador) e registra a simulação com os parâmetros usados. */
export async function saveSimulationAction(formData: FormData): Promise<ActionResult> {
  return runAction("pricing.save_simulation", async () => {
    const ctx = await requirePermission("pricing.simulate");
    const input = parseInput(simulationSchema, formDataToObject(formData));
    const supabase = await createClient();
    const org = ctx.organization.id;
    const [{ data: offer }, profiles] = await Promise.all([
      supabase
        .from("supplier_offers")
        .select("id, catalog_product_id, supplier_cost, inbound_shipping_cost, supplier_handling_fee, cost_updated_at, sku")
        .eq("id", input.offerId)
        .eq("organization_id", org)
        .eq("catalog_product_id", input.productId)
        .maybeSingle(),
      loadProfiles(supabase, org),
    ]);
    const profile = profiles.find((p) => p.id === input.profileId);
    if (!offer || !profile) return { ok: false, error: "Oferta ou perfil não encontrado." };

    const cost = {
      supplierCost: String(offer.supplier_cost),
      inboundShippingCost: String(offer.inbound_shipping_cost),
      supplierHandlingFee: String(offer.supplier_handling_fee),
      costUpdatedAt: offer.cost_updated_at,
    };
    const priceValue = input.price ? parseBrlAmount(input.price) : null;
    const result = calculate(cost, profile.rules, priceValue ? [priceValue.toFixed(2)] : []);
    if (result.status !== "complete") return { ok: false, error: `Parâmetros ausentes: ${result.missing.join(", ")}.` };
    const evaluation = result.scenarios[0] ?? result.atSuggested;
    if (!evaluation) return { ok: false, error: "Não há preço viável para registrar." };

    const { error } = await supabase.from("pricing_calculations").insert({
      organization_id: org,
      catalog_product_id: input.productId,
      supplier_offer_id: offer.id,
      pricing_profile_id: profile.id,
      pricing_rule_version_id: profile.ruleVersionId,
      input_snapshot: asJson({ cost, rules: profile.rules, requestedPrice: priceValue?.toFixed(2) ?? null, sku: offer.sku }),
      result_snapshot: asJson(result),
      cost_total: numeric(evaluation.totalCosts),
      selling_price: numeric(evaluation.price),
      estimated_fees: numeric(evaluation.fees),
      estimated_tax: numeric(evaluation.taxes),
      estimated_profit: numeric(evaluation.profit),
      estimated_margin: evaluation.margin === null ? null : numeric(evaluation.margin),
      break_even_price: result.breakEvenPrice === null ? null : numeric(result.breakEvenPrice),
      calculation_version: CALCULATION_VERSION,
      has_estimates: result.hasEstimates,
      missing_inputs: [],
      created_by: ctx.user.id,
    });
    if (error) return { ok: false, error: describeDbError(error) };
    revalidatePath("/app/pricing");
    return { ok: true, message: "Simulação registrada no histórico." };
  });
}
