/**
 * Contrato de integração com fornecedores. Cada adaptador declara explicitamente o que suporta;
 * o restante da aplicação consulta `capabilities` antes de chamar qualquer operação.
 */
export const SUPPLIER_CAPABILITIES = [
  "search_products",
  "get_offer",
  "sync_prices",
  "sync_stock",
  "create_order",
  "get_shipment",
  "get_tracking",
] as const;
export type SupplierCapability = (typeof SUPPLIER_CAPABILITIES)[number];

export type SupplierOfferSnapshot = {
  externalOfferId: string | null;
  sku: string;
  title: string;
  cost: string; // decimal em string
  availableStock: number;
  handlingTimeDays: number | null;
  observedAt: string;
};

export type SupplierOrderRequest = {
  idempotencyKey: string;
  items: { sku: string; quantity: number }[];
  shippingAddress: Record<string, string>;
  marketplaceOrderId: string;
};

export type SupplierOrderResult =
  | { status: "accepted"; externalPurchaseOrderId: string; totalCost: string | null }
  | { status: "rejected"; reason: string };

export type SupplierTracking = { trackingCode: string | null; trackingUrl: string | null; status: string };

export type SupplierAdapterContext = {
  organizationId: string;
  connectionId: string;
  configuration: Record<string, unknown>;
  /** Segredo decifrado sob demanda; nunca registrado em log. */
  getSecret: () => Promise<string | null>;
};

export class SupplierCapabilityNotSupportedError extends Error {
  constructor(adapterKey: string, capability: SupplierCapability) {
    super(`O fornecedor "${adapterKey}" não oferece a operação "${capability}".`);
    this.name = "SupplierCapabilityNotSupportedError";
  }
}

export class SupplierNotConfiguredError extends Error {
  constructor(adapterKey: string, public readonly steps: string[]) {
    super(`A integração "${adapterKey}" não está configurada.`);
    this.name = "SupplierNotConfiguredError";
  }
}

export interface SupplierAdapter {
  readonly key: string;
  readonly displayName: string;
  readonly capabilities: ReadonlySet<SupplierCapability>;
  /** Indica se há configuração suficiente para chamadas externas. */
  isConfigured(ctx: SupplierAdapterContext): boolean;
  /** Passos documentados para ativar a integração quando não configurada. */
  activationSteps(): string[];
  searchProducts?(ctx: SupplierAdapterContext, query: string): Promise<SupplierOfferSnapshot[]>;
  getOffer?(ctx: SupplierAdapterContext, sku: string): Promise<SupplierOfferSnapshot | null>;
  createOrder?(ctx: SupplierAdapterContext, request: SupplierOrderRequest): Promise<SupplierOrderResult>;
  getTracking?(ctx: SupplierAdapterContext, externalPurchaseOrderId: string): Promise<SupplierTracking | null>;
}

export function supports(adapter: SupplierAdapter, capability: SupplierCapability): boolean {
  return adapter.capabilities.has(capability);
}
