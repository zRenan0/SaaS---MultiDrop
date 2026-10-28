import { expect, test } from "@playwright/test";
import { createOrganization, signUp, uniqueEmail } from "./helpers";

test("calculadora: parâmetros ausentes, perfil, preço sugerido, cenários e histórico", async ({ page }) => {
  await signUp(page, uniqueEmail("preco"), "Preço");
  await createOrganization(page, `Loja Preço ${Date.now()}`);

  await page.goto("/app/suppliers");
  await page.getByLabel("Nome do fornecedor").fill("Fornecedor Beta");
  await page.getByRole("button", { name: "Cadastrar fornecedor" }).click();
  await expect(page.getByRole("cell", { name: /Fornecedor Beta/ })).toBeVisible();

  await page.goto("/app/products/new");
  await page.getByLabel("Título").fill("Caixa de som portátil");
  await page.getByLabel("Fornecedor", { exact: true }).selectOption({ label: "Fornecedor Beta" });
  await page.getByLabel("SKU no fornecedor").fill("CX-1");
  await page.getByLabel("Custo de aquisição (R$)").fill("50");
  await page.getByLabel("Frete de entrada (R$)").fill("5");
  await page.getByLabel("Taxa de preparação/despacho (R$)").fill("3");
  await page.getByLabel("Estoque disponível").fill("8");
  await page.getByRole("button", { name: "Salvar produto" }).click();
  await expect(page.getByText("Produto e oferta salvos.")).toBeVisible();
  const productUrl = page.url();
  const productId = productUrl.split("/app/products/")[1].split("?")[0];

  // Perfil incompleto (sem tarifa e sem tributos): calculadora não apresenta valores
  await page.goto("/app/pricing");
  await expect(page.getByText("Configure um perfil de preço")).toBeVisible();
  const newProfile = page.locator("form").filter({ has: page.getByRole("button", { name: "Criar perfil" }) });
  await newProfile.getByLabel("Nome do perfil").fill("Clássico incompleto");
  await newProfile.getByLabel("Margem líquida desejada (%)").fill("15");
  await newProfile.getByLabel("Frete pago a partir do limite (R$)").fill("0");
  await newProfile.getByRole("button", { name: "Criar perfil" }).click();
  await expect(page.getByText("Perfil salvo.").first()).toBeVisible();
  await page.goto(`/app/pricing?product=${productId}`);
  await expect(page.getByText(/Não é possível calcular: faltam parâmetros/)).toBeVisible();
  await expect(page.getByText("Tarifa de venda do marketplace (%)")).toBeVisible();

  // Perfil completo, valores conferidos manualmente nos testes unitários do motor
  await page.goto("/app/pricing");
  const form = page.locator("form").filter({ has: page.getByRole("button", { name: "Criar perfil" }) });
  await form.getByLabel("Nome do perfil").fill("Clássico");
  await form.getByLabel("Margem líquida desejada (%)").fill("15");
  await form.getByLabel("Tarifa de venda (%)").fill("12");
  await form.getByLabel("Custo fixo se preço abaixo de (R$)").fill("79");
  await form.getByLabel("Custo fixo abaixo do limite (R$)").fill("6");
  await form.getByLabel("Custo fixo a partir do limite (R$)").fill("0");
  await form.getByLabel("Frete do vendedor muda a partir de (R$)").fill("79");
  await form.getByLabel("Frete pago abaixo do limite (R$)").fill("0");
  await form.getByLabel("Frete pago a partir do limite (R$)").fill("20");
  await form.getByLabel("Tributos estimados sobre a venda (%)").fill("6");
  await form.getByLabel("Reserva para devoluções e perdas (%)").fill("2");
  await form.getByLabel("Custo operacional por unidade (R$)").fill("1");
  await form.getByLabel("Custo extra 1 (descrição)").fill("Embalagem");
  await form.getByLabel("Valor (R$)").first().fill("2");
  await form.getByRole("button", { name: "Criar perfil" }).click();
  await expect(page.getByText("Perfil salvo.").first()).toBeVisible();

  await page.goto(`/app/pricing?product=${productId}&p1=99,90&p2=129,90`);
  await page.getByLabel("Perfil", { exact: true }).selectOption({ label: "Clássico (padrão)" });
  await page.getByRole("button", { name: "Calcular" }).click();
  const row = page.getByRole("row").filter({ hasText: "Fornecedor Beta" });
  await expect(row.getByRole("cell", { name: "R$ 58,00" })).toBeVisible();
  await expect(row.getByRole("cell", { name: "R$ 101,26" })).toBeVisible();
  await expect(row.getByRole("cell", { name: "R$ 124,62" })).toBeVisible();
  await expect(row.getByText("R$ 22,92")).toBeVisible();
  await expect(page.getByText("estimado").first()).toBeVisible();
  await expect(page.getByText(/Tarifas do marketplace informadas manualmente/)).toBeVisible();

  await page.getByRole("button", { name: "Registrar simulação do preço sugerido" }).click();
  await expect(page.getByText("Simulação registrada no histórico.")).toBeVisible();
  await page.reload();
  await expect(page.getByText("Histórico de simulações")).toBeVisible();
  await expect(page.getByRole("row").filter({ hasText: "Caixa de som portátil" }).getByText("R$ 18,70")).toBeVisible();
});
