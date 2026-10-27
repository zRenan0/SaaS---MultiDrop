"use client";

import { Button } from "@/components/ui/button";
import { ActionForm } from "@/components/forms/action-form";
import { cancelSubscriptionAction, changePlanAction } from "@/features/billing/actions";

export function ChangePlanButton({ planCode, planName, disabled, nonFinancial }: { planCode: string; planName: string; disabled: boolean; nonFinancial: boolean }) {
  return (
    <ActionForm
      action={changePlanAction}
      confirm={{
        title: `Mudar para o plano ${planName}?`,
        description: nonFinancial
          ? "Ambiente de desenvolvimento: o plano será ativado sem cobrança real."
          : "Você será direcionado ao provedor de pagamento para concluir a assinatura.",
        confirmLabel: "Confirmar",
      }}
    >
      <input type="hidden" name="planCode" value={planCode} />
      <Button type="submit" size="sm" disabled={disabled}>Escolher</Button>
    </ActionForm>
  );
}

export function CancelSubscriptionButton({ subscriptionId }: { subscriptionId: string }) {
  return (
    <ActionForm
      action={cancelSubscriptionAction}
      confirm={{ title: "Cancelar assinatura?", description: "A empresa volta ao plano padrão e os limites menores passam a valer imediatamente." }}
    >
      <input type="hidden" name="subscriptionId" value={subscriptionId} />
      <Button type="submit" size="sm" variant="destructive">Cancelar assinatura</Button>
    </ActionForm>
  );
}
