import { MlHttpClient } from "@/server/integrations/mercado-livre/http";
import { tokenResponseSchema, type TokenResponse } from "@/server/integrations/mercado-livre/schemas";
import type { MercadoLivreConfig } from "@/lib/env";

export function buildAuthorizationUrl(config: MercadoLivreConfig, state: string, codeChallenge: string | null): string {
  const url = new URL("/authorization", config.authBaseUrl);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", config.clientId);
  url.searchParams.set("redirect_uri", config.redirectUri);
  url.searchParams.set("state", state);
  if (config.usePkce && codeChallenge) {
    url.searchParams.set("code_challenge", codeChallenge);
    url.searchParams.set("code_challenge_method", "S256");
  }
  return url.toString();
}

export async function exchangeAuthorizationCode(
  http: MlHttpClient,
  config: MercadoLivreConfig,
  code: string,
  codeVerifier: string | null,
): Promise<TokenResponse> {
  const form: Record<string, string> = {
    grant_type: "authorization_code",
    client_id: config.clientId,
    client_secret: config.clientSecret,
    code,
    redirect_uri: config.redirectUri,
  };
  if (config.usePkce && codeVerifier) form.code_verifier = codeVerifier;
  // Troca de código não é repetida: o código é de uso único.
  const { data } = await http.request<unknown>("/oauth/token", { method: "POST", form, retry: false });
  return tokenResponseSchema.parse(data);
}

export async function refreshAccessToken(http: MlHttpClient, config: MercadoLivreConfig, refreshToken: string): Promise<TokenResponse> {
  const { data } = await http.request<unknown>("/oauth/token", {
    method: "POST",
    retry: false,
    form: { grant_type: "refresh_token", client_id: config.clientId, client_secret: config.clientSecret, refresh_token: refreshToken },
  });
  return tokenResponseSchema.parse(data);
}
