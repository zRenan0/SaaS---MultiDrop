import "server-only";
import { randomBytes } from "node:crypto";
import { mercadoLivreConfig } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";
import { decryptSecret, encryptSecret, pkceChallenge, randomToken, sha256Hex } from "@/lib/security/crypto";
import { logger } from "@/lib/logging/logger";
import { audit } from "@/server/audit";
import { MlHttpClient } from "@/server/integrations/mercado-livre/http";
import { buildAuthorizationUrl, exchangeAuthorizationCode } from "@/server/integrations/mercado-livre/oauth";
import { userSchema } from "@/server/integrations/mercado-livre/schemas";
import { storeInitialCredentials } from "@/server/integrations/mercado-livre/credential-store";

export const OAUTH_COOKIE = "ml_oauth_state";
export const OAUTH_TTL_SECONDS = 600;

export async function startOAuth(params: { organizationId: string; userId: string }) {
  const config = mercadoLivreConfig();
  const state = randomToken(32);
  const verifier = randomBytes(48).toString("base64url");
  const stateHash = sha256Hex(state);
  const encrypted = encryptSecret(verifier, `oauth:${stateHash}`);
  const admin = createAdminClient();
  const { error } = await admin.rpc("oauth_state_create", {
    p_state_hash: stateHash,
    p_organization_id: params.organizationId,
    p_user_id: params.userId,
    p_marketplace: "mercado_livre",
    p_verifier: encrypted.ciphertext,
    p_key_version: encrypted.keyVersion,
    p_ttl_seconds: OAUTH_TTL_SECONDS,
  });
  if (error) throw error;
  return { state, url: buildAuthorizationUrl(config, state, config.usePkce ? pkceChallenge(verifier) : null) };
}

export type CallbackOutcome =
  | { ok: true; organizationId: string; accountId: string; nickname: string }
  | { ok: false; reason: "invalid_state" | "forbidden" | "exchange_failed" | "account_in_use" | "plan_limit" | "user_mismatch" | "unexpected" };

/** Conclui o OAuth: consome o state (uso único, mesmo usuário), troca o código e grava a conta e os tokens cifrados. */
export async function completeOAuth(params: {
  state: string;
  code: string;
  userId: string;
  hasAdminRole: (organizationId: string) => Promise<boolean>;
}): Promise<CallbackOutcome> {
  const config = mercadoLivreConfig();
  const admin = createAdminClient();
  const stateHash = sha256Hex(params.state);
  const { data: consumed, error: consumeError } = await admin.rpc("oauth_state_consume", { p_state_hash: stateHash, p_user_id: params.userId });
  if (consumeError) throw consumeError;
  const row = consumed?.[0];
  if (!row) return { ok: false, reason: "invalid_state" };
  if (!(await params.hasAdminRole(row.organization_id))) return { ok: false, reason: "forbidden" };

  const http = new MlHttpClient({ baseUrl: config.apiBaseUrl });
  let tokens;
  let me;
  try {
    const verifier = decryptSecret(row.encrypted_code_verifier, `oauth:${stateHash}`);
    tokens = await exchangeAuthorizationCode(http, config, params.code, verifier);
    const { data } = await http.request<unknown>("/users/me", { accessToken: tokens.access_token });
    me = userSchema.parse(data);
  } catch (error) {
    logger.warn("ml_oauth_exchange_failed", { organizationId: row.organization_id, error });
    return { ok: false, reason: "exchange_failed" };
  }
  if (me.id !== tokens.user_id) return { ok: false, reason: "user_mismatch" };

  const { data: existing } = await admin
    .from("marketplace_accounts")
    .select("id, organization_id")
    .eq("marketplace", "mercado_livre")
    .eq("external_account_id", me.id)
    .neq("status", "disconnected")
    .maybeSingle();
  if (existing && existing.organization_id !== row.organization_id) return { ok: false, reason: "account_in_use" };

  const values = {
    nickname: me.nickname,
    site_id: me.site_id ?? config.siteId,
    status: "active" as const,
    granted_scopes: tokens.scope.split(/[\s,]+/).filter(Boolean),
    account_tags: me.tags,
    user_product_seller: me.tags.includes("user_product_seller"),
    last_synced_at: new Date().toISOString(),
    last_error: null,
    connected_by: params.userId,
  };
  let accountId = existing?.id;
  if (accountId) {
    const { error } = await admin.from("marketplace_accounts").update(values).eq("id", accountId);
    if (error) throw error;
  } else {
    const { data, error } = await admin
      .from("marketplace_accounts")
      .insert({ organization_id: row.organization_id, marketplace: "mercado_livre", external_account_id: me.id, ...values })
      .select("id")
      .single();
    if (error) {
      if (error.message?.startsWith("Limite do plano")) return { ok: false, reason: "plan_limit" };
      if (error.code === "23505") return { ok: false, reason: "account_in_use" };
      throw error;
    }
    accountId = data.id;
  }

  await storeInitialCredentials(admin, {
    accountId,
    organizationId: row.organization_id,
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token ?? null,
    expiresAt: new Date(Date.now() + tokens.expires_in * 1000),
  });
  await audit({
    organizationId: row.organization_id,
    actorUserId: params.userId,
    action: "marketplace.connect",
    entityType: "marketplace_account",
    entityId: accountId,
    metadata: { external_account_id: me.id, nickname: me.nickname, scopes: values.granted_scopes },
  });
  return { ok: true, organizationId: row.organization_id, accountId, nickname: me.nickname };
}
