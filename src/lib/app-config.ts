/** Configurações públicas (seguras para o navegador). */
export const appConfig = {
  name: process.env.NEXT_PUBLIC_APP_NAME || "MultiDrop",
  url: process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",
  locale: "pt-BR",
  timeZone: "America/Sao_Paulo",
  currency: "BRL",
} as const;
