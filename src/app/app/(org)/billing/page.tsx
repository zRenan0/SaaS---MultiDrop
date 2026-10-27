import type { Metadata } from "next";
import { Check } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { PageHeader } from "@/components/layout/page-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { createClient } from "@/lib/supabase/server";
import { formatBRL } from "@/lib/money";
import { formatDate, formatDateTime } from "@/lib/dates";
import { FEATURE_LABELS, LIMIT_LABELS, usageLines } from "@/features/billing/limits";
import { getCurrentPlan, getUsage } from "@/features/billing/service";
import { CancelSubscriptionButton, ChangePlanButton } from "@/features/billing/components";
import { can } from "@/features/organizations/roles";
import { getBillingProvider } from "@/server/integrations/billing/providers";
import { requireOrgContext } from "@/server/session";

export const metadata: Metadata = { title: "Plano e uso" };

const SUB_STATUS = { trialing: ["Teste", "info"], active: ["Ativa", "success"], past_due: ["Pagamento pendente", "warning"], canceled: ["Cancelada", "neutral"], incomplete: ["Incompleta", "warning"], paused: ["Pausada", "neutral"] } as const;
const PROVIDER_LABEL: Record<string, string> = { internal: "Plano padrão (sem cobrança)", development: "Desenvolvimento (não financeiro)", stripe: "Stripe", asaas: "Asaas", mercadopago: "Mercado Pago", pagarme: "Pagar.me" };

export default async function BillingPage() {
  const ctx = await requireOrgContext();
  const supabase = await createClient();
  const org = ctx.organization.id;
  const [plan, usage, { data: plans }, { data: subscriptions }, { data: events }] = await Promise.all([
    getCurrentPlan(supabase, org),
    getUsage(supabase, org),
    supabase.from("plans").select("code, name, description, monthly_price_cents, limits, features, is_public, sort_order").eq("is_public", true).order("sort_order"),
    supabase.from("subscriptions").select("id, provider, plan_code, status, current_period_start, current_period_end, created_at").eq("organization_id", org).order("created_at", { ascending: false }),
    can(ctx.role, "audit.view")
      ? supabase.from("subscription_events").select("id, event_type, old_status, new_status, old_plan_code, new_plan_code, provider, created_at").eq("organization_id", org).order("created_at", { ascending: false }).limit(20)
      : Promise.resolve({ data: [] as never[] }),
  ]);
  const provider = getBillingProvider();
  const lines = usageLines((plan?.limits ?? {}) as Record<string, unknown>, usage);
  const current = subscriptions?.find((s) => ["active", "trialing", "past_due"].includes(s.status) && s.provider !== "internal") ?? subscriptions?.find((s) => s.provider === "internal");
  const canManage = can(ctx.role, "billing.manage");

  return (
    <>
      <PageHeader title="Plano e uso" description="Limites aplicados pelo banco de dados. O consumo é contado em tempo real." />
      <div className="grid gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex flex-wrap items-center gap-2">
              Plano atual: {plan?.plan_name ?? "—"}
              {current ? <StatusBadge tone={SUB_STATUS[current.status][1]}>{SUB_STATUS[current.status][0]}</StatusBadge> : null}
            </CardTitle>
            <CardDescription>
              {current ? `${PROVIDER_LABEL[current.provider] ?? current.provider}` : "Sem assinatura"}
              {current?.current_period_end ? ` · período até ${formatDate(current.current_period_end)}` : ""}
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            <ul className="grid gap-4 sm:grid-cols-2" aria-label="Consumo do plano">
              {lines.map((l) => (
                <li key={l.key} className="grid gap-1.5" data-testid={`usage-${l.key}`}>
                  <div className="flex justify-between text-sm">
                    <span>{l.label}</span>
                    <span className={l.reached ? "font-medium text-destructive" : "text-muted-foreground"}>
                      {l.used.toLocaleString("pt-BR")} / {l.limit === null ? "ilimitado" : l.limit.toLocaleString("pt-BR")}
                    </span>
                  </div>
                  {l.percent !== null ? <Progress value={l.percent} aria-label={`${l.label}: ${l.percent}%`} /> : null}
                </li>
              ))}
            </ul>
            {current && current.provider !== "internal" && canManage ? (
              <div>
                <CancelSubscriptionButton subscriptionId={current.id} />
              </div>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Planos disponíveis</CardTitle>
            <CardDescription>
              {provider.configured
                ? provider.isFinancial
                  ? `Pagamento processado por ${provider.label}.`
                  : "Ambiente de desenvolvimento: troca de plano sem cobrança real (bloqueado em produção)."
                : "Provedor de pagamento ainda não configurado. Para mudar de plano, fale com o suporte."}{" "}
              Valores marcados como “a definir” ainda não foram fixados comercialmente.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-3">
            {(plans ?? []).map((p) => {
              const isCurrent = p.code === plan?.plan_code;
              const limits = (p.limits ?? {}) as Record<string, number>;
              const features = (Array.isArray(p.features) ? p.features : []) as string[];
              return (
                <div key={p.code} className={`grid content-start gap-3 rounded-xl border p-4 ${isCurrent ? "border-primary" : ""}`}>
                  <div>
                    <p className="font-medium">{p.name} {isCurrent ? <StatusBadge tone="info">atual</StatusBadge> : null}</p>
                    <p className="text-sm text-muted-foreground">{p.description}</p>
                  </div>
                  <p className="text-xl font-semibold">{p.monthly_price_cents === null ? "Preço a definir" : p.monthly_price_cents === 0 ? "Sem custo" : `${formatBRL(p.monthly_price_cents / 100)}/mês`}</p>
                  <ul className="grid gap-1 text-sm">
                    {Object.entries(LIMIT_LABELS).map(([k, label]) => (
                      <li key={k}>{label}: {limits[k] === undefined ? "ilimitado" : limits[k].toLocaleString("pt-BR")}</li>
                    ))}
                  </ul>
                  <ul className="grid gap-1 text-sm">
                    {features.map((f) => (
                      <li key={f} className="flex items-center gap-1.5"><Check className="size-3.5 text-success" aria-hidden /> {FEATURE_LABELS[f] ?? f}</li>
                    ))}
                  </ul>
                  {canManage && !isCurrent ? <ChangePlanButton planCode={p.code} planName={p.name} disabled={!provider.configured} nonFinancial={!provider.isFinancial} /> : null}
                </div>
              );
            })}
          </CardContent>
        </Card>

        {events && events.length > 0 ? (
          <Card>
            <CardHeader>
              <CardTitle>Histórico da assinatura</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="divide-y text-sm">
                {events.map((e) => (
                  <li key={e.id} className="flex flex-wrap justify-between gap-2 py-2">
                    <span>
                      {e.old_plan_code ? `${e.old_plan_code} → ` : ""}{e.new_plan_code} · {e.old_status ? `${e.old_status} → ` : ""}{e.new_status}
                    </span>
                    <span className="text-muted-foreground">{PROVIDER_LABEL[e.provider] ?? e.provider} · {formatDateTime(e.created_at)}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        ) : null}
      </div>
    </>
  );
}
