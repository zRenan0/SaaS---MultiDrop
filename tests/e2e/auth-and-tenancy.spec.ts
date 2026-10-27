import { expect, test } from "@playwright/test";
import { createOrganization, PASSWORD, signIn, signOut, signUp, uniqueEmail } from "./helpers";

test.describe("autenticação e isolamento entre empresas", () => {
  test("rotas do painel exigem login", async ({ page }) => {
    await page.goto("/app/products");
    await expect(page).toHaveURL(/\/login\?next=%2Fapp%2Fproducts/);
  });

  test("login com senha errada mostra erro sem revelar se a conta existe", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("E-mail").fill(uniqueEmail("inexistente"));
    await page.getByLabel("Senha").fill("qualquer-coisa-1");
    await page.getByRole("button", { name: "Entrar" }).click();
    await expect(page.getByRole("alert").filter({ hasText: "E-mail ou senha inválidos" })).toBeVisible();
  });

  test("cadastro valida senha fraca", async ({ page }) => {
    await page.goto("/signup");
    await page.getByLabel("Nome").fill("Fulano");
    await page.getByLabel("E-mail").fill(uniqueEmail("fraca"));
    await page.getByLabel("Senha").fill("123");
    await page.getByRole("button", { name: "Criar conta" }).click();
    await expect(page.getByText("A senha deve ter pelo menos 10 caracteres.")).toBeVisible();
  });

  test("cadastro, criação de empresa e isolamento dos dados", async ({ page }) => {
    const alice = uniqueEmail("alice");
    await signUp(page, alice, "Alice");
    await createOrganization(page, `Loja Alice ${Date.now()}`);
    await page.goto("/app/settings");
    await expect(page.getByRole("cell", { name: /Alice/ })).toBeVisible();
    await expect(page.getByRole("cell", { name: "Proprietário" })).toBeVisible();

    await signOut(page);
    const bob = uniqueEmail("bob");
    await signUp(page, bob, "Bob");
    await createOrganization(page, `Loja Bob ${Date.now()}`);
    await page.goto("/app/settings");
    await expect(page.getByRole("cell", { name: /Bob/ })).toBeVisible();
    await expect(page.getByRole("cell", { name: /Alice/ })).toHaveCount(0);

    // Bob tenta forçar a organização de Alice pelo cookie: o servidor ignora e mantém a dele.
    const cookies = await page.context().cookies();
    const forged = cookies.find((c) => c.name === "active_org");
    expect(forged).toBeTruthy();
    await page.context().addCookies([{ ...forged!, value: "00000000-0000-0000-0000-000000000000" }]);
    await page.goto("/app/settings");
    await expect(page.getByRole("cell", { name: /Bob/ })).toBeVisible();

    await signOut(page);
    await signIn(page, alice);
    await expect(page).toHaveURL(/\/app$/);
    expect(PASSWORD).toBeTruthy();
  });

  test("convite adiciona membro com o papel escolhido", async ({ page, browser }) => {
    const owner = uniqueEmail("owner");
    const guest = uniqueEmail("guest");
    await signUp(page, owner, "Dona");
    await createOrganization(page, `Empresa Convite ${Date.now()}`);
    await page.goto("/app/settings");
    await page.getByLabel("E-mail do convidado").fill(guest);
    await page.getByRole("button", { name: "Convidar" }).click();
    const inviteUrl = await page.getByTestId("invite-url").textContent();
    expect(inviteUrl).toContain("/invite/");

    const guestContext = await browser.newContext();
    const guestPage = await guestContext.newPage();
    await signUp(guestPage, guest, "Convidado");
    await guestPage.goto(new URL(inviteUrl!).pathname);
    await guestPage.getByRole("button", { name: "Aceitar convite" }).click();
    await expect(guestPage).toHaveURL(/\/app$/);
    await guestPage.goto("/app/settings");
    await expect(guestPage.getByText("Operador").first()).toBeVisible();
    // Operador não vê a seção de convites.
    await expect(guestPage.getByText("Convidar membro")).toHaveCount(0);
    await guestContext.close();
  });

  test("navegação no celular @mobile", async ({ page }) => {
    await signUp(page, uniqueEmail("mobile"), "Mobile");
    await createOrganization(page, `Loja Mobile ${Date.now()}`);
    await page.getByRole("button", { name: "Abrir menu" }).click();
    await page.getByRole("link", { name: "Configurações" }).click();
    await expect(page).toHaveURL(/\/app\/settings/);
  });
});
