import { defineConfig, devices } from "@playwright/test";

/**
 * Testes de interface. Requer Supabase local (`pnpm db:start`) e .env.local configurado.
 * Sobe um servidor Next.js dedicado (porta 3100, diretório .next-e2e) apontando o Mercado Livre
 * para um servidor SIMULADO local (tests/mocks/mercado-livre-server.mjs). Esses testes não comprovam a integração real.
 */
const PORT = 3100;
const BASE_URL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 90_000,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: BASE_URL,
    locale: "pt-BR",
    timezoneId: "America/Sao_Paulo",
    trace: "retain-on-failure",
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] }, grepInvert: /@mobile/ },
    { name: "mobile", use: { ...devices["Pixel 7"] }, grep: /@mobile/ },
  ],
  webServer: [
    {
      command: "node tests/mocks/mercado-livre-server.mjs",
      url: "http://localhost:4010/health",
      reuseExistingServer: true,
      timeout: 30_000,
    },
    {
      command: `pnpm exec next dev --port ${PORT}`,
      url: BASE_URL,
      reuseExistingServer: true,
      timeout: 180_000,
      env: {
        NEXT_DIST_DIR: ".next-e2e",
        NEXT_PUBLIC_APP_URL: BASE_URL,
        ML_CLIENT_ID: "mock-client",
        ML_CLIENT_SECRET: "mock-secret",
        ML_REDIRECT_URI: `${BASE_URL}/api/integrations/mercado-livre/callback`,
        ML_API_BASE_URL: "http://localhost:4010",
        ML_AUTH_BASE_URL: "http://localhost:4010",
        ML_USE_PKCE: "true",
        CRON_SECRET: "e2e-cron-secret-0123456789abcdef",
      },
    },
  ],
});
