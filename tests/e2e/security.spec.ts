import { expect, test } from "@playwright/test";
import { createOrganization, signUp, uniqueEmail } from "./helpers";

test.describe("segurança das rotas", () => {
  test("cabeçalhos de segurança", async ({ request }) => {
    const res = await request.get("/");
    const headers = res.headers();
    expect(headers["content-security-policy"]).toContain("frame-ancestors 'none'");
    expect(headers["x-frame-options"]).toBe("DENY");
    expect(headers["x-content-type-options"]).toBe("nosniff");
    expect(headers["x-powered-by"]).toBeUndefined();
  });

  test("rotas públicas rejeitam entradas inválidas e acesso sem segredo", async ({ request }) => {
    expect((await request.post("/api/webhooks/mercado-livre", { data: "não é json", headers: { "content-type": "application/json" } })).status()).toBe(400);
    expect((await request.post("/api/webhooks/mercado-livre", { data: { resource: "x".repeat(20_000) } })).status()).toBe(413);
    expect((await request.get("/api/jobs/run", { headers: { authorization: "Bearer errado" } })).status()).toBe(401);
    expect((await request.post("/api/billing/webhook/stripe", { data: {} })).status()).toBe(404);
    expect((await request.get("/api/health")).status()).toBe(200);
  });

  test("produto de outra empresa não é exibido e exportação não contém segredos", async ({ page, browser }) => {
    await signUp(page, uniqueEmail("dono-a"), "Dono A");
    await createOrganization(page, `Empresa Segura ${Date.now()}`);
    await page.goto("/app/suppliers");
    await page.getByLabel("Nome do fornecedor").fill("Fornecedor Sigma");
    await page.getByRole("button", { name: "Cadastrar fornecedor" }).click();
    await expect(page.getByRole("cell", { name: /Fornecedor Sigma/ })).toBeVisible();
    await page.goto("/app/products/new");
    await page.getByLabel("Título").fill("Produto privado");
    await page.getByLabel("Fornecedor", { exact: true }).selectOption({ label: "Fornecedor Sigma" });
    await page.getByLabel("SKU no fornecedor").fill("PRIV-1");
    await page.getByLabel("Custo de aquisição (R$)").fill("10");
    await page.getByLabel("Estoque disponível").fill("1");
    await page.getByRole("button", { name: "Salvar produto" }).click();
    await expect(page.getByText("Produto e oferta salvos.")).toBeVisible();
    const productPath = new URL(page.url()).pathname;
    const exportRes = await page.request.get("/app/settings/export");
    expect(exportRes.status()).toBe(200);
    expect(await exportRes.text()).not.toMatch(/encrypted_|access_token|refresh_token/);

    const other = await browser.newContext();
    const otherPage = await other.newPage();
    await signUp(otherPage, uniqueEmail("intruso"), "Intruso");
    await createOrganization(otherPage, `Empresa Intrusa ${Date.now()}`);
    // Com loading.tsx o Next.js transmite a resposta antes do notFound(): o status HTTP fica 200, mas o conteúdo é o de 404.
    await otherPage.goto(productPath);
    await expect(otherPage.getByText("Página não encontrada")).toBeVisible();
    await expect(otherPage.getByText("Produto privado")).toHaveCount(0);
    await other.close();
  });
});
