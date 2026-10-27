import path from "node:path";
import { expect, test } from "@playwright/test";
import { createOrganization, signUp, uniqueEmail } from "./helpers";

test.describe("catálogo multifonte", () => {
  test("fornecedor, cadastro manual, importação CSV e reimportação", async ({ page }) => {
    await signUp(page, uniqueEmail("catalogo"), "Catálogo");
    await createOrganization(page, `Loja Catálogo ${Date.now()}`);

    // Fornecedor
    await page.goto("/app/suppliers");
    await expect(page.getByText("Nenhum fornecedor cadastrado")).toBeVisible();
    await page.getByLabel("Nome do fornecedor").fill("Distribuidora Alfa");
    await page.getByLabel("E-mail do contato").fill("pedidos@alfa.com.br");
    await page.getByLabel(/Confirmo que existe acordo/).check();
    await page.getByRole("button", { name: "Cadastrar fornecedor" }).click();
    await expect(page.getByRole("cell", { name: /Distribuidora Alfa/ })).toBeVisible();
    await expect(page.getByText("Confirmado")).toBeVisible();

    // Cadastro manual com validação
    await page.goto("/app/products/new");
    await page.getByLabel("Título").fill("Mouse sem fio");
    await page.getByLabel("Fornecedor", { exact: true }).selectOption({ label: "Distribuidora Alfa" });
    await page.getByLabel("SKU no fornecedor").fill("mou-01");
    await page.getByLabel("Custo de aquisição (R$)").fill("abc");
    await page.getByLabel("Estoque disponível").fill("10");
    await page.getByRole("button", { name: "Salvar produto" }).click();
    await expect(page.getByText("o custo inválido.")).toBeVisible();
    await page.getByLabel("Custo de aquisição (R$)").fill("39,90");
    await page.getByLabel("GTIN/EAN").fill("7891000315508");
    await page.getByRole("button", { name: "Salvar produto" }).click();
    await expect(page.getByText(/GTIN\/EAN inválido/)).toBeVisible();
    await page.getByLabel("GTIN/EAN").fill("");
    await page.getByRole("button", { name: "Salvar produto" }).click();
    await expect(page.getByText("Produto e oferta salvos.")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Mouse sem fio" })).toBeVisible();
    await expect(page.getByText("MOU-01")).toBeVisible();
    await expect(page.getByRole("cell", { name: "R$ 39,90" }).first()).toBeVisible();

    // Edição de oferta
    await page.getByRole("button", { name: "Editar oferta" }).click();
    await page.getByRole("dialog").getByLabel("Custo de aquisição (R$)").fill("41,00");
    await page.getByRole("dialog").getByRole("button", { name: "Salvar" }).click();
    await expect(page.getByRole("cell", { name: "R$ 41,00" }).first()).toBeVisible();

    // Importação CSV
    await page.goto("/app/imports/new");
    await page.getByLabel("Fornecedor das ofertas").selectOption({ label: "Distribuidora Alfa" });
    await page.getByLabel("Arquivo").setInputFiles(path.join(__dirname, "fixtures/catalogo.csv"));
    await expect(page.getByText("catalogo.csv: 5 linha(s)")).toBeVisible();
    await page.getByRole("button", { name: "Validar e pré-visualizar" }).click();
    await expect(page.getByTestId("preview-Válidas")).toHaveText("2");
    await expect(page.getByTestId("preview-Rejeitadas")).toHaveText("3");
    await expect(page.getByTestId("preview-Duplicadas no arquivo")).toHaveText("1");
    await page.getByRole("button", { name: "Importar 2 linha(s) válida(s)" }).click();
    await expect(page.getByText(/Importação concluída: 2 oferta\(s\) nova\(s\), 0 atualizada\(s\)/)).toBeVisible();
    await page.getByRole("link", { name: "Ver relatório" }).click();
    await expect(page.getByText("Concluída")).toBeVisible();
    await expect(page.getByRole("link", { name: "Baixar linhas rejeitadas" })).toBeVisible();

    // Reimportação do mesmo arquivo atualiza em vez de duplicar
    await page.goto("/app/imports/new");
    await page.getByLabel("Fornecedor das ofertas").selectOption({ label: "Distribuidora Alfa" });
    await page.getByLabel("Arquivo").setInputFiles(path.join(__dirname, "fixtures/catalogo.csv"));
    await page.getByRole("button", { name: "Validar e pré-visualizar" }).click();
    await expect(page.getByTestId("preview-Atualizarão ofertas existentes")).toHaveText("2");
    await page.getByRole("button", { name: "Importar 2 linha(s) válida(s)" }).click();
    await expect(page.getByText(/0 oferta\(s\) nova\(s\), 2 atualizada\(s\)/)).toBeVisible();

    // Listagem, busca e filtro
    await page.goto("/app/products");
    await expect(page.getByRole("link", { name: "Cabo USB-C 1m" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Mouse sem fio" })).toBeVisible();
    await page.getByLabel("Busca").fill("CAB-02");
    await page.getByRole("button", { name: "Filtrar" }).click();
    await expect(page.getByRole("link", { name: "Cabo Lightning 1m" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Mouse sem fio" })).toHaveCount(0);
    await page.goto("/app/products?stock=zero");
    await expect(page.getByRole("link", { name: "Cabo Lightning 1m" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Cabo USB-C 1m" })).toHaveCount(0);
  });
});
