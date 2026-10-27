import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { admin, createConnection, createOrg, createUser, withOriginalPlanLimits, setPlanLimits, type TestUser } from "./helpers";
import { receiveNotification } from "@/features/marketplace/webhook";
import { runJobs } from "@/server/jobs/runner";
import { JobError } from "@/server/jobs/types";
import { createEnqueue } from "@/server/jobs/enqueue";

describe("pedidos, notificações e fila (banco real)", () => {
  let user: TestUser;
  let org: string;
  let accountId: string;
  let offerId: string;
  let listingId: string;
  const sellerId = `seller-${randomUUID().slice(0, 8)}`;
  const itemId = `MLB${Date.now()}`;
  let restore: () => Promise<void>;

  const order = (status: string, overrides: Record<string, unknown> = {}) => ({
    id: `${Date.now()}`.slice(-10),
    status,
    date_created: new Date().toISOString(),
    total_amount: 259.8,
    currency_id: "BRL",
    pack_id: null,
    seller: { id: sellerId },
    buyer: { nickname: "COMPRADOR" },
    shipping: { id: "4444" },
    tags: [],
    order_items: [{ item: { id: itemId, title: "Caixa de som", seller_sku: "SOM-1", variation_id: null }, quantity: 2, unit_price: 129.9, sale_fee: 15.59 }],
    ...overrides,
  });

  beforeAll(async () => {
    restore = await withOriginalPlanLimits();
    await setPlanLimits({ max_active_listings: 100, max_products: 100, max_supplier_offers: 100 });
    user = await createUser("pedidos");
    org = await createOrg(user, "Org Pedidos");
    const conn = await createConnection(user, org);
    const { data: product } = await admin.from("catalog_products").insert({ organization_id: org, title: "Caixa de som", normalized_title: "caixa de som" }).select("id").single();
    const { data: source } = await admin.from("supplier_sources").select("id").eq("adapter_key", "manual").single();
    const { data: offer } = await admin
      .from("supplier_offers")
      .insert({ organization_id: org, supplier_connection_id: conn, supplier_source_id: source!.id, catalog_product_id: product!.id, sku: "SOM-1", supplier_cost: 60, available_stock: 3, source: "manual" })
      .select("id")
      .single();
    offerId = offer!.id;
    const { data: account } = await admin.from("marketplace_accounts").insert({ organization_id: org, marketplace: "mercado_livre", external_account_id: sellerId, nickname: "LOJA" }).select("id").single();
    accountId = account!.id;
    const { data: listing } = await admin
      .from("marketplace_listings")
      .insert({ organization_id: org, marketplace_account_id: accountId, catalog_product_id: product!.id, supplier_offer_id: offerId, external_item_id: itemId, status: "active", price: 129.9, available_stock: 3 })
      .select("id")
      .single();
    listingId = listing!.id;
  });

  afterAll(async () => restore());

  it("grava o pedido uma única vez e baixa o estoque uma única vez", async () => {
    const o = order("paid");
    const first = await admin.rpc("ingest_marketplace_order", { p_account_id: accountId, p_order: o });
    expect(first.error).toBeNull();
    expect(first.data?.[0]).toMatchObject({ created: true, fulfillment: "awaiting_supplier", problems: [] });
    const again = await admin.rpc("ingest_marketplace_order", { p_account_id: accountId, p_order: o });
    expect(again.data?.[0]).toMatchObject({ created: false, order_id: first.data?.[0].order_id });

    const { count } = await admin.from("orders").select("id", { count: "exact", head: true }).eq("marketplace_account_id", accountId).eq("external_order_id", o.id);
    expect(count).toBe(1);
    const { data: items } = await admin.from("order_items").select("marketplace_listing_id, supplier_offer_id, quantity").eq("order_id", first.data![0].order_id);
    expect(items).toEqual([{ marketplace_listing_id: listingId, supplier_offer_id: offerId, quantity: 2 }]);
    const { data: offer } = await admin.from("supplier_offers").select("available_stock").eq("id", offerId).single();
    expect(offer!.available_stock).toBe(1);

    // Cancelamento antes do envio devolve o estoque, uma única vez.
    await admin.rpc("ingest_marketplace_order", { p_account_id: accountId, p_order: { ...o, status: "cancelled" } });
    await admin.rpc("ingest_marketplace_order", { p_account_id: accountId, p_order: { ...o, status: "cancelled" } });
    const { data: restored } = await admin.from("supplier_offers").select("available_stock").eq("id", offerId).single();
    expect(restored!.available_stock).toBe(3);
    const { data: canceled } = await admin.from("orders").select("fulfillment_status").eq("id", first.data![0].order_id).single();
    expect(canceled!.fulfillment_status).toBe("canceled");
  });

  it("sinaliza estoque insuficiente e item desconhecido como problema", async () => {
    const o = order("paid", {
      id: `9${Date.now()}`.slice(-10),
      order_items: [
        { item: { id: itemId, title: "Caixa de som", seller_sku: "SOM-1", variation_id: null }, quantity: 5, unit_price: 129.9, sale_fee: 15 },
        { item: { id: "MLB000", title: "Outro", seller_sku: null, variation_id: null }, quantity: 1, unit_price: 10, sale_fee: 1 },
      ],
    });
    const res = await admin.rpc("ingest_marketplace_order", { p_account_id: accountId, p_order: o });
    expect(res.data?.[0].fulfillment).toBe("problem");
    expect(res.data?.[0].problems.join(" ")).toMatch(/não corresponde a um anúncio/);
    expect(res.data?.[0].problems.join(" ")).toMatch(/Estoque registrado do fornecedor insuficiente/);
    // devolve estoque para os próximos testes
    await admin.from("supplier_offers").update({ available_stock: 3, status: "active" }).eq("id", offerId);
  });

  it("rejeita pedido de outro vendedor e não é executável por usuários", async () => {
    const res = await admin.rpc("ingest_marketplace_order", { p_account_id: accountId, p_order: order("paid", { seller: { id: "outro" } }) });
    expect(res.error?.code).toBe("42501");
    const asUser = await user.client.rpc("ingest_marketplace_order", { p_account_id: accountId, p_order: order("paid") });
    expect(asUser.error?.code).toBe("42501");
  });

  it("notificação: valida aplicação, deduplica e aglutina tarefas", async () => {
    const n = { _id: `n-${randomUUID()}`, resource: "/orders/123", user_id: sellerId, topic: "orders_v2", application_id: "app-1", attempts: 1 };
    expect((await receiveNotification(admin, { ...n, application_id: "outra" }, "app-1")).result).toBe("invalid");
    expect((await receiveNotification(admin, { foo: "bar" }, "app-1")).result).toBe("invalid");
    expect((await receiveNotification(admin, n, "app-1")).result).toBe("queued");
    expect((await receiveNotification(admin, n, "app-1")).result).toBe("duplicate");
    expect((await receiveNotification(admin, { ...n, _id: `n-${randomUUID()}` }, "app-1")).result).toBe("queued");
    const { count } = await admin
      .from("sync_jobs")
      .select("id", { count: "exact", head: true })
      .eq("deduplication_key", `ml:notification:${accountId}:/orders/123`)
      .in("status", ["pending", "running"]);
    expect(count).toBe(1);
    expect((await receiveNotification(admin, { ...n, _id: `n-${randomUUID()}`, user_id: "desconhecido" }, "app-1")).result).toBe("ignored");
    // limpa para não interferir no teste da fila
    await admin.from("sync_jobs").delete().eq("deduplication_key", `ml:notification:${accountId}:/orders/123`);
  });

  it("fila: sucesso, falha temporária reagendada e falha permanente registrada", async () => {
    const enqueue = createEnqueue(admin);
    const tag = randomUUID().slice(0, 6);
    await enqueue({ organizationId: org, jobType: `test.ok_${tag}`, dedupKey: `t-ok-${tag}` });
    await enqueue({ organizationId: org, jobType: `test.temp_${tag}`, dedupKey: `t-temp-${tag}` });
    await enqueue({ organizationId: org, jobType: `test.perm_${tag}`, dedupKey: `t-perm-${tag}` });
    const summary = await runJobs(
      admin,
      {
        [`test.ok_${tag}`]: async () => ({ done: true }),
        [`test.temp_${tag}`]: async () => {
          throw new JobError("indisponível", true);
        },
        [`test.perm_${tag}`]: async () => {
          throw new JobError("dados inválidos", false);
        },
      },
      { timeBudgetMs: 5_000 },
    );
    expect(summary.succeeded).toBeGreaterThanOrEqual(1);
    const { data } = await admin.from("sync_jobs").select("job_type, status, attempts, last_error, available_at").like("job_type", `test.%_${tag}`);
    const byType = Object.fromEntries((data ?? []).map((j) => [j.job_type.split(".")[1].split("_")[0], j]));
    expect(byType.ok.status).toBe("succeeded");
    expect(byType.temp.status).toBe("pending");
    expect(new Date(byType.temp.available_at).getTime()).toBeGreaterThan(Date.now());
    expect(byType.perm.status).toBe("dead");
    const { data: errors } = await admin.from("integration_errors").select("message").eq("organization_id", org).like("message", `%test.perm_${tag}%`);
    expect(errors).toHaveLength(1);
    await admin.from("sync_jobs").delete().like("job_type", `test.%_${tag}`);
  });
});
