import "server-only";
import { isProduction } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";
import { BillingNotConfiguredError, type BillingProvider } from "@/server/integrations/billing/types";

const noneProvider: BillingProvider = {
  key: "none",
  label: "Não configurado",
  isFinancial: false,
  configured: false,
  async startSubscription() {
    throw new BillingNotConfiguredError("Nenhum provedor de pagamento configurado. Fale com o suporte para alterar o plano.");
  },
  async cancelSubscription() {
    throw new BillingNotConfiguredError();
  },
};

/**
 * Adaptador de DESENVOLVIMENTO: ativa o plano imediatamente sem cobrança.
 * Recusado quando a aplicação roda em produção; além disso o banco ignora assinaturas 'development'
 * quando private.app_settings.environment = 'production' (dupla proteção).
 */
const developmentProvider: BillingProvider = {
  key: "development",
  label: "Desenvolvimento (não financeiro)",
  isFinancial: false,
  configured: true,
  async startSubscription({ organizationId, planCode }) {
    if (isProduction()) throw new BillingNotConfiguredError("O adaptador de desenvolvimento não pode ser usado em produção.");
    const admin = createAdminClient();
    await admin
      .from("subscriptions")
      .update({ status: "canceled", current_period_end: new Date().toISOString() })
      .eq("organization_id", organizationId)
      .eq("provider", "development")
      .in("status", ["active", "trialing"]);
    const now = new Date();
    const { data, error } = await admin
      .from("subscriptions")
      .insert({
        organization_id: organizationId,
        provider: "development",
        plan_code: planCode,
        status: "active",
        current_period_start: now.toISOString(),
        current_period_end: new Date(now.getTime() + 30 * 86400_000).toISOString(),
      })
      .select("id")
      .single();
    if (error) throw error;
    return { kind: "activated", subscriptionId: data.id };
  },
  async cancelSubscription({ organizationId, subscriptionId }) {
    const admin = createAdminClient();
    const { error } = await admin
      .from("subscriptions")
      .update({ status: "canceled", current_period_end: new Date().toISOString() })
      .eq("id", subscriptionId)
      .eq("organization_id", organizationId)
      .eq("provider", "development");
    if (error) throw error;
  },
};

export function getBillingProvider(): BillingProvider {
  const key = process.env.BILLING_PROVIDER ?? "none";
  if (key === "development") return isProduction() ? noneProvider : developmentProvider;
  // Provedores reais (stripe, asaas, mercadopago, pagarme) ainda não implementados: ver docs/billing.md.
  return noneProvider;
}

export function getBillingProviderByKey(key: string): BillingProvider | null {
  const current = getBillingProvider();
  return current.key === key ? current : null;
}
