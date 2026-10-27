import { config } from "dotenv";

// Testes de integração usam o Supabase local definido em .env.local (nunca produção).
config({ path: ".env.local", quiet: true });
process.env.TZ = "America/Sao_Paulo";
