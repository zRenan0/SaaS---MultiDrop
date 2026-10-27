import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createConnection, createOrg, createUser, setPlanLimits, withOriginalPlanLimits, type TestUser } from "./helpers";

const row = (overrides: Record<string, unknown> = {}) => ({
  title: "Fone Bluetooth",
  normalized_title: "fone bluetooth",
  brand: "ACME",
  model: "X1",
  category: null,
  description: null,
  gtin: null,
  sku: "FONE-1",
  external_offer_id: null,
  cost: "49.90",
  inbound_shipping_cost: "0",
  handling_fee: "0",
  stock: 10,
  handling_time_days: 2,
  images: [],
  is_example: false,
  ...overrides,
});

describe("gravação de catálogo (RPC + RLS)", () => {
  let alice: TestUser;
  let bob: TestUser;
  let orgA: string;
  let orgB: string;
  let connA: string;

  let restoreLimits: () => Promise<void>;

  beforeAll(async () => {
    restoreLimits = await withOriginalPlanLimits();
    await setPlanLimits({ max_products: 1000, max_supplier_offers: 1000 });
    alice = await createUser("alice");
    bob = await createUser("bob");
    orgA = await createOrg(alice, "Org A");
    orgB = await createOrg(bob, "Org B");
    connA = await createConnection(alice, orgA);
  });

  afterAll(async () => {
    await restoreLimits();
  });

  it("cria produto e oferta e, ao repetir o SKU, atualiza em vez de duplicar", async () => {
    const first = await alice.client.rpc("upsert_catalog_rows", { p_organization_id: orgA, p_connection_id: connA, p_source: "file_import", p_rows: [row()] });
    expect(first.error).toBeNull();
    expect(first.data?.[0]).toMatchObject({ created_products: 1, created_offers: 1, updated_offers: 0 });

    const second = await alice.client.rpc("upsert_catalog_rows", {
      p_organization_id: orgA,
      p_connection_id: connA,
      p_source: "file_import",
      p_rows: [row({ cost: "45.00", stock: 0 })],
    });
    expect(second.data?.[0]).toMatchObject({ created_products: 0, created_offers: 0, updated_offers: 1 });

    const { data: offers } = await alice.client.from("supplier_offers").select("supplier_cost, available_stock, status, version").eq("sku", "FONE-1");
    expect(offers).toHaveLength(1);
    expect(offers![0]).toMatchObject({ supplier_cost: 45, available_stock: 0, status: "out_of_stock", version: 2 });
  });

  it("reaproveita produto pelo GTIN e por título+marca+modelo", async () => {
    const connB2 = await createConnection(alice, orgA, "Fornecedor 2");
    await alice.client.rpc("upsert_catalog_rows", { p_organization_id: orgA, p_connection_id: connA, p_source: "manual", p_rows: [row({ sku: "G-1", gtin: "7891000315507", title: "Cabo", normalized_title: "cabo" })] });
    const res = await alice.client.rpc("upsert_catalog_rows", {
      p_organization_id: orgA,
      p_connection_id: connB2,
      p_source: "manual",
      p_rows: [row({ sku: "OUTRO", gtin: "7891000315507", title: "Cabo com outro nome", normalized_title: "cabo com outro nome" }), row({ sku: "FONE-B" })],
    });
    expect(res.data?.[0]).toMatchObject({ created_products: 0, created_offers: 2 });
    const { count } = await alice.client.from("catalog_products").select("id", { count: "exact", head: true }).eq("organization_id", orgA);
    expect(count).toBe(2);
  });

  it("outra empresa não grava no catálogo alheio, nem lê", async () => {
    const res = await bob.client.rpc("upsert_catalog_rows", { p_organization_id: orgA, p_connection_id: connA, p_source: "manual", p_rows: [row({ sku: "INVASOR" })] });
    expect(res.error).not.toBeNull();
    const { data } = await bob.client.from("supplier_offers").select("id").eq("organization_id", orgA);
    expect(data).toEqual([]);
    const own = await bob.client.from("catalog_products").select("id").eq("organization_id", orgB);
    expect(own.data).toEqual([]);
  });

  it("controle otimista: atualização com versão antiga não sobrescreve", async () => {
    const { data: offer } = await alice.client.from("supplier_offers").select("id, version").eq("sku", "FONE-1").single();
    const ok = await alice.client.from("supplier_offers").update({ available_stock: 5 }).eq("id", offer!.id).eq("version", offer!.version).select("id");
    expect(ok.data).toHaveLength(1);
    const stale = await alice.client.from("supplier_offers").update({ available_stock: 99 }).eq("id", offer!.id).eq("version", offer!.version).select("id");
    expect(stale.data).toHaveLength(0);
  });

  it("limite do plano interrompe a gravação inteira com mensagem clara", async () => {
    const carol = await createUser("carol");
    const orgC = await createOrg(carol, "Org C");
    const connC = await createConnection(carol, orgC);
    await setPlanLimits({ max_products: 1 });
    try {
      const res = await carol.client.rpc("upsert_catalog_rows", {
        p_organization_id: orgC,
        p_connection_id: connC,
        p_source: "file_import",
        p_rows: [row({ sku: "A", title: "Produto A", normalized_title: "produto a" }), row({ sku: "B", title: "Produto B", normalized_title: "produto b" })],
      });
      expect(res.error?.message).toMatch(/Limite do plano atingido para max_products/);
      const { count } = await carol.client.from("catalog_products").select("id", { count: "exact", head: true }).eq("organization_id", orgC);
      expect(count).toBe(0);
    } finally {
      await setPlanLimits({ max_products: 1000 });
    }
    // restauração final em afterAll
  });
});
