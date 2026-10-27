// Concede acesso ao painel do operador: node scripts/grant-platform-admin.mjs email@dominio.com
// Usa NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SECRET_KEY do ambiente (ou de .env.local).
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";

config({ path: ".env.local", quiet: true });
const email = process.argv[2]?.trim().toLowerCase();
if (!email) {
  console.error("Uso: node scripts/grant-platform-admin.mjs <email>");
  process.exit(1);
}
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });
const { data: profile, error } = await admin.from("profiles").select("id").eq("email", email).maybeSingle();
if (error || !profile) {
  console.error("Usuário não encontrado. Ele precisa criar a conta antes.");
  process.exit(1);
}
const { error: insertError } = await admin.from("platform_admins").upsert({ user_id: profile.id });
if (insertError) {
  console.error("Falha ao conceder acesso:", insertError.message);
  process.exit(1);
}
await admin.from("admin_audit_logs").insert({ actor_user_id: null, action: "platform_admin.grant", entity_type: "user", entity_id: profile.id, metadata: { via: "script" } });
console.log(`Acesso de operador concedido a ${email}.`);
