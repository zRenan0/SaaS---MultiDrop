import { MlApiError } from "@/server/integrations/mercado-livre/http";
import type { TokenResponse } from "@/server/integrations/mercado-livre/schemas";

export type StoredCredentials = {
  accessToken: string;
  refreshToken: string | null;
  expiresAt: Date;
  generation: number;
  lockedUntil: Date | null;
};

/** Persistência das credenciais (implementação real usa funções restritas ao service role). */
export interface CredentialStore {
  load(accountId: string): Promise<StoredCredentials | null>;
  claimRefresh(accountId: string, generation: number, leaseSeconds: number): Promise<boolean>;
  completeRefresh(accountId: string, expectedGeneration: number, tokens: { accessToken: string; refreshToken: string | null; expiresAt: Date }): Promise<boolean>;
  releaseRefresh(accountId: string): Promise<void>;
  markReauthorizationRequired(accountId: string, reason: string): Promise<void>;
}

export class ReauthorizationRequiredError extends Error {
  constructor(message = "A conta do Mercado Livre precisa ser autorizada novamente.") {
    super(message);
    this.name = "ReauthorizationRequiredError";
  }
}

const REFRESH_MARGIN_MS = 5 * 60_000;
const LEASE_SECONDS = 30;

/**
 * Obtém um access token válido, renovando quando faltar menos de 5 minutos.
 * Concorrência: apenas quem obtém o lease renova; a gravação é compare-and-swap pela geração,
 * de modo que uma renovação antiga nunca sobrescreve credenciais mais recentes. Os demais aguardam e releem.
 */
export async function getValidAccessToken(
  accountId: string,
  store: CredentialStore,
  refresh: (refreshToken: string) => Promise<TokenResponse>,
  options: { now?: () => Date; sleep?: (ms: number) => Promise<void>; maxWaits?: number } = {},
): Promise<string> {
  const now = options.now ?? (() => new Date());
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const maxWaits = options.maxWaits ?? 20;

  for (let wait = 0; wait <= maxWaits; wait++) {
    const creds = await store.load(accountId);
    if (!creds) throw new ReauthorizationRequiredError("Conta sem credenciais. Conecte novamente.");
    if (creds.expiresAt.getTime() - now().getTime() > REFRESH_MARGIN_MS) return creds.accessToken;
    if (!creds.refreshToken) {
      await store.markReauthorizationRequired(accountId, "Sem refresh token (escopo offline_access ausente).");
      throw new ReauthorizationRequiredError();
    }

    const claimed = await store.claimRefresh(accountId, creds.generation, LEASE_SECONDS);
    if (!claimed) {
      await sleep(250 + wait * 100);
      continue;
    }
    try {
      const tokens = await refresh(creds.refreshToken);
      const expiresAt = new Date(now().getTime() + tokens.expires_in * 1000);
      const saved = await store.completeRefresh(accountId, creds.generation, {
        accessToken: tokens.access_token,
        // Se a resposta não trouxer novo refresh token, mantém o atual.
        refreshToken: tokens.refresh_token ?? creds.refreshToken,
        expiresAt,
      });
      if (saved) return tokens.access_token;
      // Outra renovação gravou antes (não deveria ocorrer com o lease); relê.
      continue;
    } catch (error) {
      await store.releaseRefresh(accountId);
      if (error instanceof MlApiError && (error.code === "invalid_grant" || error.status === 400 || error.status === 401)) {
        await store.markReauthorizationRequired(accountId, "Renovação recusada pelo Mercado Livre (autorização revogada ou expirada).");
        throw new ReauthorizationRequiredError();
      }
      throw error;
    }
  }
  throw new MlApiError(0, "refresh_timeout", "Tempo esgotado aguardando renovação do token por outro processo.", [], true);
}
