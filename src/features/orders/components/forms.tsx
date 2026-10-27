"use client";

import { useActionState, useState } from "react";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field } from "@/components/forms/field";
import { FormStatus, fieldError } from "@/components/forms/form-status";
import { SubmitButton } from "@/components/forms/submit-button";
import { ServerForm } from "@/components/forms/server-form";
import { ActionForm } from "@/components/forms/action-form";
import { addShipmentAction, createPurchaseOrderAction, pollOrdersAction, syncOrderAction, updatePurchaseOrderStatusAction } from "@/features/orders/actions";
import { PO_STATUS, PO_TRANSITIONS, type PurchaseOrderStatus } from "@/features/orders/status";

export function CreatePurchaseOrderForm({ orderId, connections, defaultConnectionId, estimatedCost }: { orderId: string; connections: { id: string; label: string }[]; defaultConnectionId?: string; estimatedCost?: string }) {
  const [state, action, pending] = useActionState(createPurchaseOrderAction, null);
  return (
    <ServerForm action={action} pending={pending} className="grid gap-3" noValidate>
      <FormStatus state={state} />
      <input type="hidden" name="orderId" value={orderId} />
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Fornecedor" htmlFor="supplierConnectionId" error={fieldError(state, "supplierConnectionId")}>
          <select id="supplierConnectionId" name="supplierConnectionId" defaultValue={defaultConnectionId ?? ""} className="h-8 rounded-lg border bg-background px-2 text-sm">
            <option value="">Selecione</option>
            {connections.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
          </select>
        </Field>
        <Field label="Custo total combinado (R$)" htmlFor="totalCost" error={fieldError(state, "totalCost")} hint="Conforme cobrado pelo fornecedor neste pedido.">
          <Input id="totalCost" name="totalCost" inputMode="decimal" defaultValue={estimatedCost?.replace(".", ",") ?? ""} />
        </Field>
      </div>
      <Field label="Observações (canal usado, contato, prazo combinado)" htmlFor="notes">
        <Textarea id="notes" name="notes" rows={2} />
      </Field>
      <div>
        <SubmitButton>Registrar pedido de compra</SubmitButton>
      </div>
    </ServerForm>
  );
}

const ACTION_LABELS: Partial<Record<PurchaseOrderStatus, string>> = {
  submitted: "Marcar como enviado ao fornecedor",
  accepted: "Fornecedor aceitou",
  rejected: "Fornecedor recusou",
  shipped: "Fornecedor despachou",
  delivered: "Entregue ao comprador",
  canceled: "Cancelar pedido de compra",
  draft: "Voltar para rascunho",
};

export function PurchaseOrderStatusActions({ purchaseOrderId, status }: { purchaseOrderId: string; status: PurchaseOrderStatus }) {
  const [externalId, setExternalId] = useState("");
  const next = PO_TRANSITIONS[status];
  if (next.length === 0) return null;
  return (
    <div className="grid gap-2">
      {status === "draft" ? (
        <Input aria-label="Número do pedido no fornecedor" placeholder="Número do pedido no fornecedor (opcional)" value={externalId} onChange={(e) => setExternalId(e.target.value)} className="max-w-xs" />
      ) : null}
      <div className="flex flex-wrap gap-2">
        {next.map((target) => (
          <ActionForm
            key={target}
            action={updatePurchaseOrderStatusAction}
            confirm={target === "canceled" || target === "rejected" ? { title: `${PO_STATUS[target][0]}?`, description: "O pedido de venda voltará a exigir ação do operador." } : undefined}
          >
            <input type="hidden" name="purchaseOrderId" value={purchaseOrderId} />
            <input type="hidden" name="status" value={target} />
            {externalId ? <input type="hidden" name="externalPurchaseOrderId" value={externalId} /> : null}
            <Button type="submit" size="sm" variant={target === "canceled" || target === "rejected" ? "destructive" : "outline"}>
              {ACTION_LABELS[target] ?? target}
            </Button>
          </ActionForm>
        ))}
      </div>
    </div>
  );
}

export function ShipmentForm({ purchaseOrderId, orderId }: { purchaseOrderId: string; orderId: string }) {
  const [state, action, pending] = useActionState(addShipmentAction, null);
  const id = (k: string) => `${purchaseOrderId}-${k}`;
  return (
    <ServerForm action={action} pending={pending} className="grid gap-3" noValidate>
      <FormStatus state={state} />
      <input type="hidden" name="purchaseOrderId" value={purchaseOrderId} />
      <input type="hidden" name="orderId" value={orderId} />
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Transportadora" htmlFor={id("carrier")}>
          <Input id={id("carrier")} name="carrier" />
        </Field>
        <Field label="Código de rastreio" htmlFor={id("trackingCode")} error={fieldError(state, "trackingCode")}>
          <Input id={id("trackingCode")} name="trackingCode" />
        </Field>
        <Field label="URL de rastreio" htmlFor={id("trackingUrl")} error={fieldError(state, "trackingUrl")}>
          <Input id={id("trackingUrl")} name="trackingUrl" placeholder="https://" />
        </Field>
      </div>
      <div>
        <SubmitButton>Registrar rastreio</SubmitButton>
      </div>
    </ServerForm>
  );
}

export function SyncOrderButton({ orderId }: { orderId: string }) {
  return (
    <ActionForm action={syncOrderAction}>
      <input type="hidden" name="orderId" value={orderId} />
      <Button type="submit" variant="outline" size="sm">
        <RefreshCw aria-hidden /> Consultar no Mercado Livre
      </Button>
    </ActionForm>
  );
}

export function PollOrdersButton({ accountId, label }: { accountId: string; label: string }) {
  return (
    <ActionForm action={pollOrdersAction}>
      <input type="hidden" name="accountId" value={accountId} />
      <Button type="submit" variant="outline" size="sm">
        <RefreshCw aria-hidden /> Buscar vendas recentes · {label}
      </Button>
    </ActionForm>
  );
}
