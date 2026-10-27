export type CheckoutResult =
  | { kind: "redirect"; url: string }
  | { kind: "activated"; subscriptionId: string };

export class BillingNotConfiguredError extends Error {
  constructor(message = "Cobrança não configurada nesta instalação.") {
    super(message);
    this.name = "BillingNotConfiguredError";
  }
}

/**
 * Contrato do provedor de pagamento. Um provedor real deve: criar checkout/assinatura no provedor,
 * validar a assinatura criptográfica dos webhooks e só ativar planos após confirmação do provedor.
 */
export interface BillingProvider {
  readonly key: "none" | "development" | "stripe" | "asaas" | "mercadopago" | "pagarme";
  readonly label: string;
  /** false = não movimenta dinheiro (desenvolvimento). */
  readonly isFinancial: boolean;
  readonly configured: boolean;
  startSubscription(params: { organizationId: string; planCode: string; actorUserId: string }): Promise<CheckoutResult>;
  cancelSubscription(params: { organizationId: string; subscriptionId: string }): Promise<void>;
  /** Processa webhook do provedor. Provedores sem webhook retornam null (rota responde 404). */
  handleWebhook?(request: Request): Promise<{ status: number; body: unknown }>;
}
