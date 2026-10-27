"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { parseInput, runAction } from "@/server/action";
import { audit } from "@/server/audit";
import type { ActionResult } from "@/server/errors";
import { requirePermission } from "@/server/session";
import { getBillingProvider } from "@/server/integrations/billing/providers";
import { BillingNotConfiguredError } from "@/server/integrations/billing/types";

export async function changePlanAction(formData: FormData): Promise<ActionResult> {
  let redirectTo: string | null = null;
  const result = await runAction("billing.change_plan", async () => {
    const ctx = await requirePermission("billing.manage");
    const planCode = parseInput(z.string().regex(/^[a-z0-9_]{2,40}$/), formData.get("planCode"));
    const supabase = await createClient();
    const { data: plan } = await supabase.from("plans").select("code, is_public").eq("code", planCode).maybeSingle();
    if (!plan || !plan.is_public) return { ok: false, error: "Plano indisponível." };
    const provider = getBillingProvider();
    try {
      const outcome = await provider.startSubscription({ organizationId: ctx.organization.id, planCode, actorUserId: ctx.user.id });
      await audit({ organizationId: ctx.organization.id, actorUserId: ctx.user.id, action: "billing.change_plan", entityType: "subscription", metadata: { planCode, provider: provider.key, outcome: outcome.kind } });
      if (outcome.kind === "redirect") {
        redirectTo = outcome.url;
        return { ok: true };
      }
    } catch (error) {
      if (error instanceof BillingNotConfiguredError) return { ok: false, error: error.message };
      throw error;
    }
    revalidatePath("/app/billing");
    return { ok: true, message: provider.isFinancial ? "Plano atualizado." : "Plano ativado pelo adaptador de desenvolvimento (sem cobrança)." };
  });
  if (result.ok && redirectTo) redirect(redirectTo);
  return result;
}

export async function cancelSubscriptionAction(formData: FormData): Promise<ActionResult> {
  return runAction("billing.cancel", async () => {
    const ctx = await requirePermission("billing.manage");
    const subscriptionId = parseInput(z.uuid(), formData.get("subscriptionId"));
    const supabase = await createClient();
    const { data: sub } = await supabase.from("subscriptions").select("id, provider, status").eq("id", subscriptionId).eq("organization_id", ctx.organization.id).maybeSingle();
    if (!sub || !["active", "trialing", "past_due"].includes(sub.status)) return { ok: false, error: "Assinatura não encontrada ou já encerrada." };
    if (sub.provider === "internal") return { ok: false, error: "A assinatura padrão não pode ser cancelada." };
    const provider = getBillingProvider();
    if (provider.key !== sub.provider) return { ok: false, error: "O provedor desta assinatura não está configurado nesta instalação. Fale com o suporte." };
    try {
      await provider.cancelSubscription({ organizationId: ctx.organization.id, subscriptionId: sub.id });
    } catch (error) {
      if (error instanceof BillingNotConfiguredError) return { ok: false, error: error.message };
      throw error;
    }
    await audit({ organizationId: ctx.organization.id, actorUserId: ctx.user.id, action: "billing.cancel", entityType: "subscription", entityId: sub.id });
    revalidatePath("/app/billing");
    return { ok: true, message: "Assinatura cancelada. A empresa volta ao plano padrão." };
  });
}
