import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;
const secretKey = process.env.SUPABASE_SECRET_KEY!;

if (!url?.includes("127.0.0.1") && !url?.includes("localhost")) {
  throw new Error("Testes de integração só rodam contra o Supabase local.");
}

export const admin = createClient<Database>(url, secretKey, { auth: { persistSession: false, autoRefreshToken: false } });

export type TestUser = { id: string; email: string; client: SupabaseClient<Database> };

export async function createUser(prefix: string): Promise<TestUser> {
  const email = `${prefix}-${randomUUID().slice(0, 8)}@integration.test`;
  const password = "SenhaSegura123";
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) throw error;
  const client = createClient<Database>(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error: signInError } = await client.auth.signInWithPassword({ email, password });
  if (signInError) throw signInError;
  return { id: data.user.id, email, client };
}

export async function createOrg(user: TestUser, name: string): Promise<string> {
  const slug = `${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${randomUUID().slice(0, 6)}`;
  const { data, error } = await user.client.rpc("create_organization", { org_name: name, org_slug: slug });
  if (error) throw error;
  return data;
}

export async function createConnection(user: TestUser, organizationId: string, name = "Fornecedor"): Promise<string> {
  const { data: source } = await user.client.from("supplier_sources").select("id").eq("adapter_key", "manual").single();
  const { data, error } = await user.client
    .from("supplier_connections")
    .insert({ organization_id: organizationId, supplier_source_id: source!.id, display_name: name })
    .select("id")
    .single();
  if (error) throw error;
  return data.id;
}

export async function setPlanLimits(limits: Record<string, number>) {
  const { data } = await admin.from("plans").select("limits").eq("code", "free").single();
  await admin.from("plans").update({ limits: { ...(data!.limits as object), ...limits } }).eq("code", "free");
}

/** Guarda e restaura os limites do plano padrão para não alterar o banco local de desenvolvimento. */
export async function withOriginalPlanLimits() {
  const { data } = await admin.from("plans").select("limits").eq("code", "free").single();
  const original = data!.limits;
  return async () => {
    await admin.from("plans").update({ limits: original }).eq("code", "free");
  };
}
