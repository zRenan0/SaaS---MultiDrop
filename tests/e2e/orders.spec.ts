import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { expect, test } from "@playwright/test";
import { createOrganization, signUp, uniqueEmail } from "./helpers";

config({ path: ".env.local", quiet: true });
const MOCK = "http://localhost:4010";
const CRON = "e2e-cron-secret-0123456789abcdef";

// ATENÇÃO: Mercado Livre SIMULADO. Prova o fluxo da aplicação, não a integração real.
test("venda: notificação → fila → pedido único → encaminhamento ao fornecedor → rastreio", async ({ page, request }) => {
  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false } });
  const sellerId = Math.floor(Date.now() / 1000) + 1000;
  const itemId = `MLB${Date.now()}`;
  const orderId = String(Date.now()).slice(-11);
  await request.post(`${MOCK}/__mock/next-user`, { data: { id: sellerId, nickname: `LOJA_PEDIDOS_${sellerId}` } });

  await signUp(page, uniqueEmail("pedidos"), "Pedidos");
  const orgName = `Loja Pedidos ${Date.now()}`;
  await createOrganization(page, orgName);
  await page.goto("/app/integrations");
  await page.getByRole("link", { name: "Conectar conta" }).click();
  await expect(page.getByText("Conta conectada com sucesso.")).toBeVisible();

  // Semeia catálogo e anúncio já publicado (via service role do banco LOCAL de testes).
  const { data: org } = await admin.from("organizations").select("id").eq("name", orgName).single();
  const { data: account } = await admin.from("marketplace_accounts").select("id").eq("organization_id", org!.id).single();
  const { data: source } = await admin.from("supplier_sources").select("id").eq("adapter_key", "manual").single();
  const { data: conn } = await admin.from("supplier_connections").insert({ organization_id: org!.id, supplier_source_id: source!.id, display_name: "Fornecedor Delta", dropship_agreement_confirmed: true }).select("id").single();
  const { data: product } = await admin.from("catalog_products").insert({ organization_id: org!.id, title: "Fone Bluetooth", normalized_title: "fone bluetooth" }).select("id").single();
  const { data: offer } = await admin
    .from("supplier_offers")
    .insert({ organization_id: org!.id, supplier_connection_id: conn!.id, supplier_source_id: source!.id, catalog_product_id: product!.id, sku: "FONE-9", supplier_cost: 40, available_stock: 5, source: "manual" })
    .select("id")
    .single();
  await admin.from("marketplace_listings").insert({ organization_id: org!.id, marketplace_account_id: account!.id, catalog_product_id: product!.id, supplier_offer_id: offer!.id, external_item_id: itemId, status: "active", price: 99.9, available_stock: 5, title: "Fone Bluetooth" });
  await request.post(`${MOCK}/__mock/items`, { data: { id: itemId, title: "Fone Bluetooth", price: 99.9, available_quantity: 5, seller_id: sellerId } });
  await request.post(`${MOCK}/__mock/orders`, {
    data: {
      id: Number(orderId),
      status: "paid",
      date_created: new Date().toISOString(),
      total_amount: 199.8,
      currency_id: "BRL",
      seller: { id: sellerId },
      buyer: { id: 1, nickname: "COMPRADOR_TESTE" },
      shipping: { id: 55501 },
      tags: ["paid"],
      order_items: [{ item: { id: itemId, title: "Fone Bluetooth", seller_sku: "FONE-9", variation_id: null }, quantity: 2, unit_price: 99.9, sale_fee: 11.99 }],
    },
  });

  // Notificações: duplicada (mesmo _id) e repetida (outro _id, mesmo recurso)
  const notification = { _id: `e2e-${orderId}`, resource: `/orders/${orderId}`, user_id: sellerId, topic: "orders_v2", application_id: "mock-client", attempts: 1, sent: new Date().toISOString() };
  expect((await request.post("/api/webhooks/mercado-livre", { data: notification })).status()).toBe(200);
  expect(await (await request.post("/api/webhooks/mercado-livre", { data: notification })).json()).toEqual({ result: "duplicate" });
  expect((await request.post("/api/webhooks/mercado-livre", { data: { ...notification, _id: `e2e-${orderId}-b` } })).status()).toBe(200);
  expect((await request.post("/api/webhooks/mercado-livre", { data: { ...notification, application_id: "outra-app" } })).status()).toBe(400);

  // Agendador (sem segredo é recusado)
  expect((await request.get("/api/jobs/run")).status()).toBe(401);
  const run = await request.get("/api/jobs/run", { headers: { authorization: `Bearer ${CRON}` } });
  expect(run.status()).toBe(200);

  const { count } = await admin.from("orders").select("id", { count: "exact", head: true }).eq("marketplace_account_id", account!.id).eq("external_order_id", orderId);
  expect(count).toBe(1);
  const { data: offerAfter } = await admin.from("supplier_offers").select("available_stock").eq("id", offer!.id).single();
  expect(offerAfter!.available_stock).toBe(3);

  // Operador encaminha ao fornecedor
  await page.goto("/app/orders");
  await expect(page.getByRole("link", { name: orderId })).toBeVisible();
  await expect(page.getByRole("row").filter({ hasText: orderId }).getByText("Encaminhar ao fornecedor")).toBeVisible();
  await page.getByRole("link", { name: orderId }).click();
  await expect(page.getByText("Fornecedor Delta").first()).toBeVisible();
  await expect(page.getByLabel("Custo total combinado (R$)")).toHaveValue("80,00");
  await page.getByRole("button", { name: "Registrar pedido de compra" }).click();
  await expect(page.getByText("Rascunho")).toBeVisible();
  await page.getByRole("button", { name: "Marcar como enviado ao fornecedor" }).click();
  await expect(page.getByText("Status atualizado.")).toBeVisible();
  await page.getByRole("button", { name: "Fornecedor aceitou" }).click();
  await expect(page.getByText("Enviado ao fornecedor")).toHaveCount(0);
  await page.getByLabel("Código de rastreio").fill("BR123456789");
  await page.getByLabel("URL de rastreio").fill("https://rastreio.exemplo.com.br/BR123456789");
  await page.getByRole("button", { name: "Registrar rastreio" }).click();
  await expect(page.getByText("Rastreio registrado.").first()).toBeVisible();
  await page.getByRole("button", { name: "Fornecedor despachou" }).click();
  await expect(page.getByText("Despachado")).toBeVisible();

  await page.goto("/app/orders?status=shipped");
  await expect(page.getByRole("link", { name: orderId })).toBeVisible();

  // Operações mostram as notificações e tarefas
  await page.goto("/app/operations");
  await expect(page.getByRole("cell", { name: `/orders/${orderId}` }).first()).toBeVisible();
  await expect(page.getByRole("cell", { name: "ml.notification" }).first()).toBeVisible();
});
