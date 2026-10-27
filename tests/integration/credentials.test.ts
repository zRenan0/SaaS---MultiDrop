import { beforeAll, describe, expect, it } from "vitest";
import { admin, createOrg, createUser, type TestUser } from "./helpers";
import { createDbCredentialStore, storeInitialCredentials } from "@/server/integrations/mercado-livre/credential-store";
import { getValidAccessToken } from "@/server/integrations/mercado-livre/token-manager";

describe("credenciais do marketplace (banco real, tokens cifrados)", () => {
  let user: TestUser;
  let org: string;
  let accountId: string;

  beforeAll(async () => {
    user = await createUser("cred");
    org = await createOrg(user, "Org Cred");
    const { data, error } = await admin
      .from("marketplace_accounts")
      .insert({ organization_id: org, marketplace: "mercado_livre", external_account_id: `ext-${Date.now()}`, nickname: "TESTE" })
      .select("id")
      .single();
    if (error) throw error;
    accountId = data.id;
    await storeInitialCredentials(admin, { accountId, organizationId: org, accessToken: "APP_USR-acesso-inicial", refreshToken: "TG-refresh-inicial", expiresAt: new Date(Date.now() + 1000) });
  });

  it("armazena tokens cifrados, nunca em claro", async () => {
    const { data } = await admin.rpc("mp_get_credentials", { p_account_id: accountId });
    expect(data?.[0].encrypted_access_token).toMatch(/^v1\./);
    expect(JSON.stringify(data)).not.toContain("acesso-inicial");
    expect(JSON.stringify(data)).not.toContain("refresh-inicial");
  });

  it("usuário autenticado não acessa funções de credenciais", async () => {
    const { error } = await user.client.rpc("mp_get_credentials", { p_account_id: accountId });
    expect(error?.code).toBe("42501");
    const consume = await user.client.rpc("oauth_state_consume", { p_state_hash: "x", p_user_id: user.id });
    expect(consume.error?.code).toBe("42501");
  });

  it("renovação concorrente no banco real executa uma única troca e grava a nova geração", async () => {
    const store = createDbCredentialStore(admin);
    let calls = 0;
    const refresh = async (rt: string) => {
      expect(rt).toBe("TG-refresh-inicial");
      calls++;
      await new Promise((r) => setTimeout(r, 50));
      return { access_token: "APP_USR-acesso-renovado", expires_in: 21600, refresh_token: "TG-refresh-renovado", user_id: "1", scope: "" };
    };
    const results = await Promise.all([1, 2, 3].map(() => getValidAccessToken(accountId, store, refresh, { sleep: (ms) => new Promise((r) => setTimeout(r, Math.min(ms, 50))) })));
    expect(calls).toBe(1);
    expect(new Set(results)).toEqual(new Set(["APP_USR-acesso-renovado"]));
    const creds = await store.load(accountId);
    expect(creds?.refreshToken).toBe("TG-refresh-renovado");
    expect(creds?.generation).toBe(2);
  });

  it("CAS rejeita gravação com geração antiga", async () => {
    const store = createDbCredentialStore(admin);
    const ok = await store.completeRefresh(accountId, 1, { accessToken: "APP_USR-velho", refreshToken: "TG-velho", expiresAt: new Date() });
    expect(ok).toBe(false);
    expect((await store.load(accountId))?.accessToken).toBe("APP_USR-acesso-renovado");
  });

  it("estado OAuth é de uso único e vinculado ao usuário", async () => {
    await admin.rpc("oauth_state_create", { p_state_hash: `h-${accountId}`, p_organization_id: org, p_user_id: user.id, p_marketplace: "mercado_livre", p_verifier: "v1.x.y.z", p_key_version: 1, p_ttl_seconds: 600 });
    const other = await admin.rpc("oauth_state_consume", { p_state_hash: `h-${accountId}`, p_user_id: "00000000-0000-0000-0000-000000000000" });
    expect(other.data).toEqual([]);
    const first = await admin.rpc("oauth_state_consume", { p_state_hash: `h-${accountId}`, p_user_id: user.id });
    expect(first.data?.[0].organization_id).toBe(org);
    const again = await admin.rpc("oauth_state_consume", { p_state_hash: `h-${accountId}`, p_user_id: user.id });
    expect(again.data).toEqual([]);
  });
});
