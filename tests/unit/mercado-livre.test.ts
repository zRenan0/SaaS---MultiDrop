import { describe, expect, it, vi } from "vitest";
import { backoffDelay, MlApiError, MlHttpClient, type FetchLike } from "@/server/integrations/mercado-livre/http";
import { buildAuthorizationUrl, exchangeAuthorizationCode } from "@/server/integrations/mercado-livre/oauth";
import { getValidAccessToken, ReauthorizationRequiredError, type CredentialStore, type StoredCredentials } from "@/server/integrations/mercado-livre/token-manager";
import { notificationSchema } from "@/server/integrations/mercado-livre/schemas";
import type { MercadoLivreConfig } from "@/lib/env";

const config: MercadoLivreConfig = {
  clientId: "123",
  clientSecret: "segredo",
  redirectUri: "https://app.exemplo.com/api/integrations/mercado-livre/callback",
  siteId: "MLB",
  usePkce: true,
  apiBaseUrl: "https://api.mercadolibre.com",
  authBaseUrl: "https://auth.mercadolivre.com.br",
};

const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(body === null ? null : JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });

describe("cliente HTTP", () => {
  it("repete GET em 429/5xx respeitando Retry-After e retorna sucesso", async () => {
    const calls: string[] = [];
    const responses = [json(429, { error: "too_many_requests" }, { "retry-after": "2" }), json(503, { message: "indisponível" }), json(200, { ok: true })];
    const fetchImpl: FetchLike = async (url) => {
      calls.push(url);
      return responses.shift()!;
    };
    const sleeps: number[] = [];
    const http = new MlHttpClient({ baseUrl: "https://api.test", fetchImpl, sleep: async (ms) => void sleeps.push(ms), baseDelayMs: 100 });
    const res = await http.request<{ ok: boolean }>("/users/me", { accessToken: "APP_USR-x", query: { a: 1, b: undefined } });
    expect(res.data.ok).toBe(true);
    expect(calls).toHaveLength(3);
    expect(calls[0]).toBe("https://api.test/users/me?a=1");
    expect(sleeps[0]).toBe(2000);
  });

  it("não repete POST e expõe causas do erro", async () => {
    const fetchImpl = vi.fn<FetchLike>(async () => json(400, { error: "validation_error", message: "inválido", cause: [{ code: "item.price.invalid", message: "Preço" }] }));
    const http = new MlHttpClient({ baseUrl: "https://api.test", fetchImpl, sleep: async () => {} });
    const error = await http.request("/items", { method: "POST", json: {} }).catch((e) => e);
    expect(error).toBeInstanceOf(MlApiError);
    expect(error.status).toBe(400);
    expect(error.causes[0].code).toBe("item.price.invalid");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("trata falha de rede como temporária e remove tokens das mensagens", async () => {
    const fetchImpl: FetchLike = async () => {
      throw new Error("conexão recusada com Bearer APP_USR-123-secreto");
    };
    const http = new MlHttpClient({ baseUrl: "https://api.test", fetchImpl, sleep: async () => {}, maxAttempts: 2 });
    const error = await http.request("/x").catch((e) => e);
    expect(error.retryable).toBe(true);
    expect(error.message).not.toContain("secreto");
  });

  it("backoff cresce exponencialmente com limite", () => {
    expect(backoffDelay(1, 500, null)).toBeGreaterThanOrEqual(500);
    expect(backoffDelay(3, 500, null)).toBeGreaterThanOrEqual(2000);
    expect(backoffDelay(20, 500, null)).toBeLessThanOrEqual(30_000);
  });
});

describe("OAuth", () => {
  it("monta URL de autorização com state e PKCE S256", () => {
    const url = new URL(buildAuthorizationUrl(config, "estado-aleatorio", "desafio"));
    expect(url.origin).toBe("https://auth.mercadolivre.com.br");
    expect(url.pathname).toBe("/authorization");
    expect(Object.fromEntries(url.searchParams)).toEqual({
      response_type: "code",
      client_id: "123",
      redirect_uri: config.redirectUri,
      state: "estado-aleatorio",
      code_challenge: "desafio",
      code_challenge_method: "S256",
    });
  });

  it("troca o código enviando formulário com code_verifier", async () => {
    let body = "";
    const fetchImpl: FetchLike = async (_url, init) => {
      body = String(init?.body);
      expect((init?.headers as Record<string, string>)["Content-Type"]).toBe("application/x-www-form-urlencoded");
      return json(200, { access_token: "APP_USR-novo-token", expires_in: 21600, refresh_token: "TG-refresh-token", user_id: 99, scope: "offline_access read write" });
    };
    const tokens = await exchangeAuthorizationCode(new MlHttpClient({ baseUrl: config.apiBaseUrl, fetchImpl }), config, "TG-codigo", "verificador");
    const params = new URLSearchParams(body);
    expect(params.get("grant_type")).toBe("authorization_code");
    expect(params.get("code_verifier")).toBe("verificador");
    expect(params.get("redirect_uri")).toBe(config.redirectUri);
    expect(tokens.user_id).toBe("99");
  });
});

class MemoryStore implements CredentialStore {
  creds: StoredCredentials;
  reauth: string | null = null;
  constructor(expiresInMs: number) {
    this.creds = { accessToken: "old-access", refreshToken: "refresh-1", expiresAt: new Date(Date.now() + expiresInMs), generation: 1, lockedUntil: null };
  }
  async load() {
    return { ...this.creds };
  }
  async claimRefresh(_id: string, generation: number) {
    if (this.creds.generation !== generation || (this.creds.lockedUntil && this.creds.lockedUntil > new Date())) return false;
    this.creds.lockedUntil = new Date(Date.now() + 30_000);
    return true;
  }
  async completeRefresh(_id: string, expected: number, tokens: { accessToken: string; refreshToken: string | null; expiresAt: Date }) {
    if (this.creds.generation !== expected) return false;
    this.creds = { ...tokens, generation: expected + 1, lockedUntil: null };
    return true;
  }
  async releaseRefresh() {
    this.creds.lockedUntil = null;
  }
  async markReauthorizationRequired(_id: string, reason: string) {
    this.reauth = reason;
  }
}

describe("renovação de tokens", () => {
  it("usa o token atual quando ainda válido", async () => {
    const store = new MemoryStore(60 * 60_000);
    const refresh = vi.fn();
    expect(await getValidAccessToken("a", store, refresh)).toBe("old-access");
    expect(refresh).not.toHaveBeenCalled();
  });

  it("renova perto da expiração e grava o novo refresh token (rotação)", async () => {
    const store = new MemoryStore(60_000);
    const token = await getValidAccessToken("a", store, async (rt) => {
      expect(rt).toBe("refresh-1");
      return { access_token: "new-access-token", expires_in: 21600, refresh_token: "refresh-2", user_id: "1", scope: "" };
    });
    expect(token).toBe("new-access-token");
    expect(store.creds.refreshToken).toBe("refresh-2");
    expect(store.creds.generation).toBe(2);
  });

  it("renovações concorrentes chamam o Mercado Livre uma única vez", async () => {
    const store = new MemoryStore(60_000);
    let calls = 0;
    const refresh = async () => {
      calls++;
      await new Promise((r) => setTimeout(r, 20));
      return { access_token: `access-${calls}-aaaaaa`, expires_in: 21600, refresh_token: `refresh-${calls + 1}-aaaaa`, user_id: "1", scope: "" };
    };
    const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, Math.min(ms, 10)));
    const results = await Promise.all([1, 2, 3, 4, 5].map(() => getValidAccessToken("a", store, refresh, { sleep })));
    expect(calls).toBe(1);
    expect(new Set(results)).toEqual(new Set(["access-1-aaaaaa"]));
  });

  it("invalid_grant marca a conta para reautorização e libera o lease", async () => {
    const store = new MemoryStore(0);
    const error = await getValidAccessToken("a", store, async () => {
      throw new MlApiError(400, "invalid_grant", "invalid_grant");
    }).catch((e) => e);
    expect(error).toBeInstanceOf(ReauthorizationRequiredError);
    expect(store.reauth).toMatch(/Renovação recusada/);
    expect(store.creds.lockedUntil).toBeNull();
  });
});

describe("notificações", () => {
  it("valida payload documentado e rejeita recursos estranhos", () => {
    const ok = notificationSchema.safeParse({ _id: "abc", resource: "/orders/2000001", user_id: 123, topic: "orders_v2", application_id: 456, attempts: 1, sent: "2026-10-27T10:00:00.000Z" });
    expect(ok.success && ok.data.user_id).toBe("123");
    expect(notificationSchema.safeParse({ resource: "https://evil.com", user_id: 1, topic: "orders_v2", application_id: 1 }).success).toBe(false);
    expect(notificationSchema.safeParse({ resource: "/orders/1 <script>", user_id: 1, topic: "orders_v2", application_id: 1 }).success).toBe(false);
  });
});
