import "server-only";
import { mercadoLivreConfig } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";
import { MercadoLivreClient } from "@/server/integrations/mercado-livre/client";
import { createDbCredentialStore } from "@/server/integrations/mercado-livre/credential-store";
import { MlHttpClient } from "@/server/integrations/mercado-livre/http";
import { refreshAccessToken } from "@/server/integrations/mercado-livre/oauth";
import { getValidAccessToken } from "@/server/integrations/mercado-livre/token-manager";

export function mlHttp() {
  return new MlHttpClient({ baseUrl: mercadoLivreConfig().apiBaseUrl });
}

/**
 * Cliente autenticado para uma conta. O chamador deve ter verificado antes que a conta pertence
 * à organização ativa e que o usuário tem permissão (ou estar em processo do sistema já validado).
 */
export function mlClientForAccount(accountId: string, siteId: string) {
  const config = mercadoLivreConfig();
  const http = new MlHttpClient({ baseUrl: config.apiBaseUrl });
  const store = createDbCredentialStore(createAdminClient());
  return new MercadoLivreClient(http, () => getValidAccessToken(accountId, store, (rt) => refreshAccessToken(http, config, rt)), siteId);
}
