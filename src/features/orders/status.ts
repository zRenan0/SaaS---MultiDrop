export const FULFILLMENT_STATUS = {
  pending: ["Aguardando pagamento", "neutral"],
  awaiting_supplier: ["Encaminhar ao fornecedor", "warning"],
  forwarded: ["Encaminhado", "info"],
  shipped: ["Enviado", "info"],
  delivered: ["Entregue", "success"],
  problem: ["Requer atenção", "danger"],
  canceled: ["Cancelado", "neutral"],
} as const;

export const PO_STATUS = {
  draft: ["Rascunho", "neutral"],
  submitted: ["Enviado ao fornecedor", "info"],
  accepted: ["Aceito", "success"],
  rejected: ["Recusado", "danger"],
  shipped: ["Despachado", "info"],
  delivered: ["Entregue", "success"],
  canceled: ["Cancelado", "neutral"],
  failed: ["Falhou", "danger"],
} as const;

export type PurchaseOrderStatus = keyof typeof PO_STATUS;

/** Próximos status permitidos (espelha o trigger do banco). */
export const PO_TRANSITIONS: Record<PurchaseOrderStatus, PurchaseOrderStatus[]> = {
  draft: ["submitted", "canceled"],
  submitted: ["accepted", "rejected", "canceled"],
  accepted: ["shipped", "canceled"],
  shipped: ["delivered"],
  delivered: [],
  rejected: [],
  canceled: [],
  failed: ["draft"],
};

/** Efeito do status do pedido de compra no andamento do pedido de venda. */
export function fulfillmentFromPurchaseOrder(status: PurchaseOrderStatus): keyof typeof FULFILLMENT_STATUS | null {
  switch (status) {
    case "submitted":
    case "accepted":
      return "forwarded";
    case "shipped":
      return "shipped";
    case "delivered":
      return "delivered";
    case "rejected":
    case "failed":
      return "problem";
    case "canceled":
      return "awaiting_supplier";
    default:
      return null;
  }
}
