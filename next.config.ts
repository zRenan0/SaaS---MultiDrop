import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV !== "production";

// Origem do Supabase: o navegador envia imagens de produto direto ao Storage (URL assinada) e exibe as fotos.
const supabaseOrigin = (() => {
  try {
    return new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").origin;
  } catch {
    // Sem a variável (ex.: lint) a política fica restrita à própria aplicação.
    return "";
  }
})();

// O navegador só conversa com a própria aplicação e, para imagens, com o Storage do Supabase.
// 'unsafe-inline' em scripts é exigido pelos scripts de hidratação do Next.js sem nonce; 'unsafe-eval' apenas em desenvolvimento.
const contentSecurityPolicy = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  `img-src 'self' data: https:${supabaseOrigin ? ` ${supabaseOrigin}` : ""}`,
  "font-src 'self' data:",
  `connect-src 'self'${supabaseOrigin ? ` ${supabaseOrigin}` : ""}${isDev ? " ws: wss:" : ""}`,
  "frame-ancestors 'none'",
  "form-action 'self' https://auth.mercadolivre.com.br",
  "base-uri 'self'",
  "object-src 'none'",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: contentSecurityPolicy },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
];

const nextConfig: NextConfig = {
  // Painel autenticado: todas as páginas dependem da sessão. Ver docs/decisions.md (ADR-004).
  cacheComponents: false,
  poweredByHeader: false,
  // Diretório separado permite um servidor de testes E2E isolado (ver playwright.config.ts).
  distDir: process.env.NEXT_DIST_DIR || ".next",
  experimental: {
    serverActions: { bodySizeLimit: "6mb" },
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
