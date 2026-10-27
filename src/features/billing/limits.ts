/** Rótulos e cálculo de consumo por limite do plano (puro, testável). */
export const LIMIT_LABELS: Record<string, string> = {
  max_members: "Membros",
  max_products: "Produtos no catálogo",
  max_supplier_offers: "Ofertas de fornecedores",
  max_marketplace_accounts: "Contas do Mercado Livre",
  max_active_listings: "Anúncios ativos",
  max_imports_per_month: "Importações no mês",
};

export const FEATURE_LABELS: Record<string, string> = {
  catalog: "Catálogo e importação",
  pricing: "Calculadora de lucro",
  marketplace: "Integração com o Mercado Livre",
  orders: "Gestão de pedidos",
  competitors: "Pesquisa de preços de concorrentes",
  supplier_api: "Integração por API com fornecedores",
};

export type UsageLine = { key: string; label: string; used: number; limit: number | null; percent: number | null; reached: boolean };

export function usageLines(limits: Record<string, unknown>, usage: Record<string, number>): UsageLine[] {
  return Object.keys(LIMIT_LABELS).map((key) => {
    const raw = limits[key];
    const limit = typeof raw === "number" ? raw : raw === null || raw === undefined ? null : Number(raw);
    const used = usage[key] ?? 0;
    const percent = limit === null || !Number.isFinite(limit) ? null : limit === 0 ? 100 : Math.min(100, Math.round((used / limit) * 100));
    return { key, label: LIMIT_LABELS[key], used, limit: limit !== null && Number.isFinite(limit) ? limit : null, percent, reached: limit !== null && used >= limit };
  });
}

export function hasFeature(features: unknown, feature: string): boolean {
  return Array.isArray(features) && features.includes(feature);
}
