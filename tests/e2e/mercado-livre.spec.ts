import { expect, test } from "@playwright/test";
import { createOrganization, signUp, uniqueEmail } from "./helpers";

// ATENÇÃO: usa o servidor SIMULADO do Mercado Livre (tests/mocks). Não comprova a integração real.
test.describe("Mercado Livre (simulado): OAuth, rascunho, validação e publicação", () => {
  test("fluxo completo com confirmação explícita", async ({ page, browser, request }) => {
    const mlUserId = Math.floor(Date.now() / 1000);
    await request.post("http://localhost:4010/__mock/next-user", { data: { id: mlUserId, nickname: `VENDEDOR_TESTE_MOCK_${mlUserId}` } });
    await signUp(page, uniqueEmail("ml"), "Vendedor");
    await createOrganization(page, `Loja ML ${Date.now()}`);

    await page.goto("/app/suppliers");
    await page.getByLabel("Nome do fornecedor").fill("Fornecedor Gama");
    await page.getByRole("button", { name: "Cadastrar fornecedor" }).click();
    await expect(page.getByRole("cell", { name: /Fornecedor Gama/ })).toBeVisible();

    await page.goto("/app/products/new");
    await page.getByLabel("Título").fill("Caixa de Som Bluetooth 10W");
    await page.getByLabel("Marca").fill("ACME");
    await page.getByLabel("URLs das imagens (uma por linha)").fill("https://cdn.exemplo.com.br/caixa.jpg");
    await page.getByLabel(/Tenho autorização/).check();
    await page.getByLabel("Fornecedor", { exact: true }).selectOption({ label: "Fornecedor Gama" });
    await page.getByLabel("SKU no fornecedor").fill("SOM-10");
    await page.getByLabel("Custo de aquisição (R$)").fill("60");
    await page.getByLabel("Estoque disponível").fill("8");
    await page.getByRole("button", { name: "Salvar produto" }).click();
    await expect(page.getByText("Produto e oferta salvos.")).toBeVisible();
    const productUrl = page.url();

    // OAuth
    await page.goto("/app/integrations");
    await expect(page.getByText("Nenhuma conta conectada")).toBeVisible();
    await page.getByRole("link", { name: "Conectar conta" }).click();
    await expect(page.getByText("Conta conectada com sucesso.")).toBeVisible();
    await expect(page.getByText(`VENDEDOR_TESTE_MOCK_${mlUserId}`)).toBeVisible();
    await expect(page.getByText("Clássico (title)")).toBeVisible();
    await expect(page.getByText("offline_access, read, write")).toBeVisible();
    await page.getByRole("button", { name: "Consultar conta" }).click();
    await expect(page.getByText("Dados da conta atualizados.")).toBeVisible();

    // Usuário de teste: exige confirmação e mostra a senha uma única vez
    await page.getByRole("button", { name: "Criar usuário de teste" }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Criar usuário de teste" }).click();
    await expect(page.getByText("TESTMOCK123")).toBeVisible();
    await expect(page.getByText("senha-simulada")).toBeVisible();
    await page.reload();
    await expect(page.getByText("senha-simulada")).toHaveCount(0);

    // Rascunho
    await page.goto(productUrl);
    await page.getByRole("link", { name: "Preparar anúncio" }).click();
    await page.getByRole("button", { name: "Criar rascunho" }).click();
    await expect(page).toHaveURL(/\/app\/listings\/[0-9a-f-]{36}$/);
    await page.getByRole("button", { name: "Sugerir pelo título" }).click();
    await page.getByRole("button", { name: /MLB1234/ }).click();
    await page.getByLabel("Preço de venda (R$)").fill("129,90");
    await page.getByLabel("Estoque a anunciar").fill("5");
    await page.getByRole("button", { name: "Salvar rascunho" }).click();
    await expect(page.getByText("Rascunho salvo.")).toBeVisible();
    await page.reload();

    // Atributos obrigatórios vêm da categoria; Modelo vazio → validação local bloqueia
    await expect(page.getByLabel("Marca *")).toHaveValue("ACME");
    await page.getByLabel("Tipo de anúncio").selectOption("gold_special");
    await page.getByRole("button", { name: "Salvar rascunho" }).click();
    await expect(page.getByText("Rascunho salvo.")).toBeVisible();
    await page.getByRole("button", { name: "Validar no Mercado Livre" }).click();
    await expect(page.getByTestId("validation-issues")).toContainText("Atributo obrigatório: Modelo.");

    await page.getByLabel("Modelo *").fill("BT-10");
    await page.getByRole("button", { name: "Salvar rascunho" }).click();
    await expect(page.getByText("Rascunho salvo.")).toBeVisible();
    await page.getByRole("button", { name: "Validar no Mercado Livre" }).click();
    await expect(page.getByText("Anúncio validado pelo Mercado Livre (nada foi publicado).")).toBeVisible();

    await page.getByRole("button", { name: "Consultar tarifa oficial" }).click();
    await expect(page.getByText(/Tarifa oficial registrada/)).toBeVisible();
    await page.reload();
    await expect(page.getByText(/Tarifa oficial do Mercado Livre consultada em/)).toBeVisible();

    // Publicação exige digitar PUBLICAR e confirmar no diálogo
    const publish = page.getByRole("button", { name: "Publicar anúncio" });
    await expect(publish).toBeDisabled();
    await page.getByLabel("Para publicar, digite PUBLICAR").fill("PUBLICAR");
    await publish.click();
    await page.getByRole("button", { name: "Publicar agora" }).click();
    await expect(page.getByText(/Anúncio MLB\d+ criado no Mercado Livre com status "active"/)).toBeVisible();
    await page.reload();
    await expect(page.getByText(/Publicado como/)).toBeVisible();
    await expect(page.getByRole("button", { name: "Salvar rascunho" })).toHaveCount(0);

    await page.goto("/app/listings");
    await expect(page.getByText("Anúncios no Mercado Livre")).toBeVisible();
    await expect(page.getByRole("cell", { name: /Caixa de Som Bluetooth 10W/ })).toBeVisible();
    await page.getByRole("button", { name: "Consultar status" }).click();
    await expect(page.getByText("Status atual no Mercado Livre: active.")).toBeVisible();

    // A mesma conta do ML não pode ser conectada a outra empresa
    const other = await browser.newContext();
    const otherPage = await other.newPage();
    await signUp(otherPage, uniqueEmail("ml2"), "Outro");
    await createOrganization(otherPage, `Outra Loja ${Date.now()}`);
    await otherPage.goto("/app/integrations");
    await otherPage.getByRole("link", { name: "Conectar conta" }).click();
    await expect(otherPage.getByText("Esta conta do Mercado Livre já está conectada a outra empresa")).toBeVisible();
    await other.close();

    // Desconexão apaga tokens
    await page.goto("/app/integrations");
    await page.getByRole("button", { name: "Desconectar" }).click();
    await page.getByRole("button", { name: "Desconectar" }).last().click();
    await expect(page.getByText(/Conta desconectada e tokens apagados/)).toBeVisible();
  });

  test("callback com state forjado é recusado", async ({ page }) => {
    await signUp(page, uniqueEmail("csrf"), "CSRF");
    await createOrganization(page, `Loja CSRF ${Date.now()}`);
    await page.goto("/api/integrations/mercado-livre/callback?code=TG-qualquer&state=estado-forjado-com-tamanho-suficiente");
    await expect(page.getByText("Sessão de autorização inválida ou expirada")).toBeVisible();
  });
});
