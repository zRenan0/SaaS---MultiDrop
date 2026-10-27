import { afterEach, describe, expect, it, vi } from "vitest";
import { hasFeature, usageLines } from "@/features/billing/limits";
import { getBillingProvider } from "@/server/integrations/billing/providers";

describe("limites e recursos do plano", () => {
  it("calcula consumo, percentual e limite atingido", () => {
    const lines = usageLines({ max_members: 2, max_products: 50, max_active_listings: null }, { max_members: 2, max_products: 10, max_active_listings: 7 });
    const byKey = Object.fromEntries(lines.map((l) => [l.key, l]));
    expect(byKey.max_members).toMatchObject({ used: 2, limit: 2, percent: 100, reached: true });
    expect(byKey.max_products).toMatchObject({ used: 10, limit: 50, percent: 20, reached: false });
    expect(byKey.max_active_listings).toMatchObject({ limit: null, percent: null, reached: false });
    expect(byKey.max_imports_per_month).toMatchObject({ used: 0, limit: null });
  });

  it("verifica recursos do plano", () => {
    expect(hasFeature(["catalog", "competitors"], "competitors")).toBe(true);
    expect(hasFeature(["catalog"], "competitors")).toBe(false);
    expect(hasFeature(null, "catalog")).toBe(false);
  });
});

describe("provedor de cobrança", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("sem configuração não permite trocar de plano", async () => {
    vi.stubEnv("BILLING_PROVIDER", "");
    const provider = getBillingProvider();
    expect(provider.key).toBe("none");
    expect(provider.configured).toBe(false);
    await expect(provider.startSubscription({ organizationId: "x", planCode: "pro", actorUserId: "u" })).rejects.toThrow(/Nenhum provedor/);
  });

  it("adaptador de desenvolvimento é não financeiro e nunca vale em produção", () => {
    vi.stubEnv("BILLING_PROVIDER", "development");
    vi.stubEnv("NODE_ENV", "development");
    expect(getBillingProvider()).toMatchObject({ key: "development", isFinancial: false, configured: true });
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("VERCEL_ENV", "production");
    expect(getBillingProvider().key).toBe("none");
  });

  it("provedores reais não implementados não ficam ativos", () => {
    vi.stubEnv("BILLING_PROVIDER", "stripe");
    expect(getBillingProvider().key).toBe("none");
  });
});
