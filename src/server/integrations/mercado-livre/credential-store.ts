import "server-only";
import { createAdminClient, type AdminSupabaseClient } from "@/lib/supabase/admin";
import { decryptSecret, encryptSecret } from "@/lib/security/crypto";
import type { CredentialStore, StoredCredentials } from "@/server/integrations/mercado-livre/token-manager";

const ctxAccess = (accountId: string) => `ml:access:${accountId}`;
const ctxRefresh = (accountId: string) => `ml:refresh:${accountId}`;

/** Grava credenciais iniciais (após OAuth). Tokens são cifrados antes de sair da aplicação. */
export async function storeInitialCredentials(
  admin: AdminSupabaseClient,
  params: { accountId: string; organizationId: string; accessToken: string; refreshToken: string | null; expiresAt: Date },
) {
  const access = encryptSecret(params.accessToken, ctxAccess(params.accountId));
  const refresh = params.refreshToken ? encryptSecret(params.refreshToken, ctxRefresh(params.accountId)).ciphertext : null;
  const { error } = await admin.rpc("mp_store_credentials", {
    p_account_id: params.accountId,
    p_organization_id: params.organizationId,
    p_access: access.ciphertext,
    p_refresh: refresh as string,
    p_expires_at: params.expiresAt.toISOString(),
    p_key_version: access.keyVersion,
  });
  if (error) throw error;
}

export function createDbCredentialStore(admin: AdminSupabaseClient = createAdminClient()): CredentialStore {
  return {
    async load(accountId): Promise<StoredCredentials | null> {
      const { data, error } = await admin.rpc("mp_get_credentials", { p_account_id: accountId });
      if (error) throw error;
      const row = data?.[0];
      if (!row) return null;
      return {
        accessToken: decryptSecret(row.encrypted_access_token, ctxAccess(accountId)),
        refreshToken: row.encrypted_refresh_token ? decryptSecret(row.encrypted_refresh_token, ctxRefresh(accountId)) : null,
        expiresAt: new Date(row.expires_at),
        generation: Number(row.token_generation),
        lockedUntil: row.refresh_locked_until ? new Date(row.refresh_locked_until) : null,
      };
    },
    async claimRefresh(accountId, generation, leaseSeconds) {
      const { data, error } = await admin.rpc("mp_claim_refresh", { p_account_id: accountId, p_generation: generation, p_lease_seconds: leaseSeconds });
      if (error) throw error;
      return data === true;
    },
    async completeRefresh(accountId, expectedGeneration, tokens) {
      const access = encryptSecret(tokens.accessToken, ctxAccess(accountId));
      const refresh = tokens.refreshToken ? encryptSecret(tokens.refreshToken, ctxRefresh(accountId)).ciphertext : null;
      const { data, error } = await admin.rpc("mp_complete_refresh", {
        p_account_id: accountId,
        p_expected_generation: expectedGeneration,
        p_access: access.ciphertext,
        p_refresh: refresh as string,
        p_expires_at: tokens.expiresAt.toISOString(),
        p_key_version: access.keyVersion,
      });
      if (error) throw error;
      return data === true;
    },
    async releaseRefresh(accountId) {
      const { error } = await admin.rpc("mp_release_refresh", { p_account_id: accountId });
      if (error) throw error;
    },
    async markReauthorizationRequired(accountId, reason) {
      const { data } = await admin
        .from("marketplace_accounts")
        .update({ status: "reauthorization_required", last_error: reason })
        .eq("id", accountId)
        .select("organization_id")
        .maybeSingle();
      if (data) {
        await admin.from("integration_errors").insert({
          organization_id: data.organization_id,
          integration_type: "mercado_livre",
          entity_type: "marketplace_account",
          entity_id: accountId,
          error_code: "reauthorization_required",
          message: reason,
          retryable: false,
        });
      }
    },
  };
}
