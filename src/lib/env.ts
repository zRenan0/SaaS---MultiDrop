import "server-only";
import { z } from "zod";

/**
 * Variáveis de ambiente do servidor, validadas sob demanda.
 * Integrações opcionais (Mercado Livre, cobrança) são validadas apenas quando usadas,
 * para que a aplicação funcione sem elas e mostre o que falta configurar.
 */
const baseSchema = z.object({
  NEXT_PUBLIC_APP_URL: z.url(),
  NEXT_PUBLIC_SUPABASE_URL: z.url(),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().min(20),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
});

export function serverEnv() {
  return baseSchema.parse({
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    NODE_ENV: process.env.NODE_ENV,
  });
}

export function supabaseSecretKey(): string {
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!key) throw new MissingConfigurationError(["SUPABASE_SECRET_KEY"]);
  return key;
}

export class MissingConfigurationError extends Error {
  constructor(public readonly variables: string[]) {
    super(`Configuração ausente: ${variables.join(", ")}`);
    this.name = "MissingConfigurationError";
  }
}

const mlSchema = z.object({
  ML_CLIENT_ID: z.string().min(1),
  ML_CLIENT_SECRET: z.string().min(1),
  ML_REDIRECT_URI: z.url(),
  ML_SITE_ID: z.string().regex(/^[A-Z]{3}$/).default("MLB"),
  ML_USE_PKCE: z.enum(["true", "false"]).default("true"),
});

export type MercadoLivreConfig = {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  siteId: string;
  usePkce: boolean;
};

export function mercadoLivreConfigStatus(): { configured: boolean; missing: string[] } {
  const required = ["ML_CLIENT_ID", "ML_CLIENT_SECRET", "ML_REDIRECT_URI", "TOKEN_ENCRYPTION_KEYS", "SUPABASE_SECRET_KEY"];
  const missing = required.filter((name) => !process.env[name]);
  return { configured: missing.length === 0, missing };
}

export function mercadoLivreConfig(): MercadoLivreConfig {
  const { missing } = mercadoLivreConfigStatus();
  if (missing.length > 0) throw new MissingConfigurationError(missing);
  const parsed = mlSchema.parse(process.env);
  return {
    clientId: parsed.ML_CLIENT_ID,
    clientSecret: parsed.ML_CLIENT_SECRET,
    redirectUri: parsed.ML_REDIRECT_URI,
    siteId: parsed.ML_SITE_ID,
    usePkce: parsed.ML_USE_PKCE === "true",
  };
}

export function cronSecret(): string | null {
  const value = process.env.CRON_SECRET;
  return value && value.length >= 16 ? value : null;
}

export function isProduction(): boolean {
  return process.env.NODE_ENV === "production" && process.env.VERCEL_ENV !== "preview";
}
