import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { expect, test } from "@playwright/test";
import { createOrganization, signIn, signUp, uniqueEmail } from "./helpers";

config({ path: ".env.local", quiet: true });

test("plano e uso: consumo real e troca de plano pelo adaptador de desenvolvimento", async ({ page }) => {
  await signUp(page, uniqueEmail("plano"), "Plano");
  await createOrganization(page, `Loja Plano ${Date.now()}`);
  await page.goto("/app/billing");
  await expect(page.getByText("Plano atual: Gratuito")).toBeVisible();
  await expect(page.getByTestId("usage-max_members")).toContainText("1 / 2");
  await expect(page.getByTestId("usage-max_products")).toContainText("0 / 50");
  await expect(page.getByText("Preço a definir").first()).toBeVisible();
  await expect(page.getByText(/Ambiente de desenvolvimento: troca de plano sem cobrança real/)).toBeVisible();

  await page.getByRole("button", { name: "Escolher" }).first().click();
  await page.getByRole("button", { name: "Confirmar" }).click();
  await expect(page.getByText("Plano ativado pelo adaptador de desenvolvimento (sem cobrança).")).toBeVisible();
  await page.reload();
  await expect(page.getByText("Plano atual: Profissional")).toBeVisible();
  await expect(page.getByText("Desenvolvimento (não financeiro)").first()).toBeVisible();
  await expect(page.getByTestId("usage-max_products")).toContainText("0 / 2.000");

  await page.getByRole("button", { name: "Cancelar assinatura" }).click();
  await page.getByRole("button", { name: "Confirmar" }).click();
  await expect(page.getByText(/Assinatura cancelada/)).toBeVisible();
  await page.reload();
  await expect(page.getByText("Plano atual: Gratuito")).toBeVisible();
});

test("painel do operador: oculto para usuários comuns; suspensão bloqueia a empresa", async ({ page, browser }) => {
  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false } });

  // Cliente comum
  const clientEmail = uniqueEmail("cliente");
  const clientOrg = `Cliente Suspenso ${Date.now()}`;
  const clientCtx = await browser.newContext();
  const clientPage = await clientCtx.newPage();
  await signUp(clientPage, clientEmail, "Cliente");
  await createOrganization(clientPage, clientOrg);
  const notFound = await clientPage.goto("/admin");
  expect(notFound?.status()).toBe(404);

  // Operador
  const operatorEmail = uniqueEmail("operador");
  await signUp(page, operatorEmail, "Operador");
  await createOrganization(page, `Operação ${Date.now()}`);
  const { data: profile } = await admin.from("profiles").select("id").eq("email", operatorEmail).single();
  await admin.from("platform_admins").insert({ user_id: profile!.id });
  await page.goto("/admin");
  await expect(page.getByRole("heading", { name: "Visão geral da plataforma" })).toBeVisible();
  await expect(page.getByText("Empresas ativas")).toBeVisible();

  await page.goto(`/admin/organizations?q=${encodeURIComponent(clientOrg)}`);
  const row = page.getByRole("row").filter({ hasText: clientOrg });
  await row.getByLabel("Motivo").fill("Teste automatizado");
  await row.getByRole("button", { name: "Suspender" }).click();
  await page.getByRole("button", { name: "Confirmar" }).click();
  await expect(page.getByText(/Empresa suspensa/)).toBeVisible();

  await clientPage.goto("/app/settings");
  await expect(clientPage).toHaveURL(/\/app\/onboarding/);

  await page.reload();
  await row.getByLabel("Motivo").fill("Liberado após teste");
  await row.getByRole("button", { name: "Reativar" }).click();
  await page.getByRole("button", { name: "Confirmar" }).click();
  await expect(page.getByText("Empresa reativada.")).toBeVisible();
  await clientPage.goto("/app/settings");
  await expect(clientPage.getByRole("cell", { name: /Cliente/ }).first()).toBeVisible();
  await clientCtx.close();

  const { data: logs } = await admin.from("admin_audit_logs").select("action").eq("actor_user_id", profile!.id);
  expect(logs?.map((l) => l.action)).toEqual(expect.arrayContaining(["organization.suspend", "organization.reactivate"]));
  expect(signIn).toBeTruthy();
});
