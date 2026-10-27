import { expect, type Page } from "@playwright/test";

export function uniqueEmail(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@e2e.test`;
}

export const PASSWORD = "SenhaSegura123";

export async function signUp(page: Page, email: string, name = "Usuário Teste") {
  await page.goto("/signup");
  await page.getByLabel("Nome").fill(name);
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Senha").fill(PASSWORD);
  await page.getByRole("button", { name: "Criar conta" }).click();
  await expect(page).toHaveURL(/\/app\/onboarding/);
}

export async function signIn(page: Page, email: string) {
  await page.goto("/login");
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Senha").fill(PASSWORD);
  await page.getByRole("button", { name: "Entrar" }).click();
}

export async function createOrganization(page: Page, name: string) {
  await page.goto("/app/onboarding");
  await page.getByLabel("Nome da empresa").fill(name);
  await page.getByRole("button", { name: "Criar empresa" }).click();
  await expect(page).toHaveURL(/\/app$/);
  await expect(page.getByRole("heading", { name: "Visão geral" })).toBeVisible();
}

export async function signOut(page: Page) {
  await page.context().clearCookies();
}
