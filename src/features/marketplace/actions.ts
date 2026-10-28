"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseInput, runAction } from "@/server/action";
import { audit } from "@/server/audit";
import type { ActionResult } from "@/server/errors";
import { requirePermission } from "@/server/session";
import { checkRateLimit } from "@/lib/security/rate-limit";
import { uuidSchema } from "@/features/organizations/schemas";
import { getAccountForOrg, recordIntegrationError } from "@/features/marketplace/accounts";
import { mlClientForAccount } from "@/server/integrations/mercado-livre/factory";
import { MlApiError } from "@/server/integrations/mercado-livre/http";
import { ReauthorizationRequiredError } from "@/server/integrations/mercado-livre/token-manager";

export async function disconnectAccountAction(formData: FormData): Promise<ActionResult> {
  return runAction("marketplace.disconnect", async () => {
    const ctx = await requirePermission("marketplace.connect");
    const accountId = parseInput(uuidSchema, formData.get("accountId"));
    const account = await getAccountForOrg(accountId, ctx.organization.id);
    const admin = createAdminClient();
    const { error } = await admin.rpc("mp_delete_credentials", { p_account_id: account.id });
    if (error) throw error;
    await admin.from("marketplace_accounts").update({ status: "disconnected", last_error: null }).eq("id", account.id);
    await audit({ organizationId: ctx.organization.id, actorUserId: ctx.user.id, action: "marketplace.disconnect", entityType: "marketplace_account", entityId: account.id });
    revalidatePath("/app/integrations");
    return { ok: true, message: "Conta desconectada e tokens apagados. Revogue também o acesso do aplicativo na sua conta do Mercado Livre." };
  });
}

export async function syncAccountAction(formData: FormData): Promise<ActionResult> {
  return runAction("marketplace.sync_account", async () => {
    const ctx = await requirePermission("marketplace.connect");
    const accountId = parseInput(uuidSchema, formData.get("accountId"));
    const account = await getAccountForOrg(accountId, ctx.organization.id);
    if (account.status === "disconnected") return { ok: false, error: "Conta desconectada. Conecte novamente." };
    const admin = createAdminClient();
    try {
      const me = await mlClientForAccount(account.id, account.site_id).getMe();
      if (me.id !== account.external_account_id) return { ok: false, error: "O token pertence a outra conta do Mercado Livre. Reconecte." };
      await admin
        .from("marketplace_accounts")
        .update({
          nickname: me.nickname,
          account_tags: me.tags,
          user_product_seller: me.tags.includes("user_product_seller"),
          last_synced_at: new Date().toISOString(),
          last_error: null,
          status: "active",
        })
        .eq("id", account.id);
      revalidatePath("/app/integrations");
      return { ok: true, message: "Dados da conta atualizados." };
    } catch (error) {
      const message =
        error instanceof ReauthorizationRequiredError ? error.message : error instanceof MlApiError ? `Mercado Livre respondeu ${error.status}: ${error.message}` : "Falha ao consultar a conta.";
      await admin.from("marketplace_accounts").update({ last_error: message }).eq("id", account.id);
      await recordIntegrationError({ organizationId: ctx.organization.id, entityType: "marketplace_account", entityId: account.id, code: error instanceof MlApiError ? error.code : "sync_failed", message, retryable: error instanceof MlApiError && error.retryable });
      revalidatePath("/app/integrations");
      return { ok: false, error: message };
    }
  });
}

export type TestUserCredentials = { id: string; nickname: string; password: string; email?: string };

/**
 * Cria um usuário de teste do Mercado Livre usando a conta conectada. Usuários de teste servem para validar
 * publicação e vendas sem afetar a conta real. A senha é devolvida uma única vez e não é gravada nem registrada em log.
 */
export async function createTestUserAction(formData: FormData): Promise<ActionResult<TestUserCredentials>> {
  return runAction("marketplace.create_test_user", async () => {
    const ctx = await requirePermission("marketplace.connect");
    const accountId = parseInput(uuidSchema, formData.get("accountId"));
    const account = await getAccountForOrg(accountId, ctx.organization.id);
    if (account.status !== "active") return { ok: false, error: "A conta precisa estar conectada." };
    if (!(await checkRateLimit("ml_test_user", account.id, 3, 86_400))) {
      return { ok: false, error: "Limite de criação de usuários de teste atingido hoje para esta conta." };
    }
    try {
      const created = await mlClientForAccount(account.id, account.site_id).createTestUser();
      await audit({
        organizationId: ctx.organization.id,
        actorUserId: ctx.user.id,
        action: "marketplace.test_user_created",
        entityType: "marketplace_account",
        entityId: account.id,
        metadata: { test_user_id: created.id, nickname: created.nickname },
      });
      return {
        ok: true,
        message: "Usuário de teste criado. Copie a senha agora: ela não será exibida de novo.",
        data: { id: created.id, nickname: created.nickname, password: created.password, email: created.email },
      };
    } catch (error) {
      if (error instanceof ReauthorizationRequiredError) return { ok: false, error: error.message };
      if (error instanceof MlApiError) return { ok: false, error: `Mercado Livre respondeu ${error.status}: ${error.message}` };
      throw error;
    }
  });
}
