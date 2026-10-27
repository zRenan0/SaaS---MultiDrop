import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { UserSupabaseClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database";

/** Consumo atual da organização, contado no banco com as mesmas regras dos triggers de limite. */
export async function getUsage(supabase: SupabaseClient<Database>, organizationId: string): Promise<Record<string, number>> {
  const head = { count: "exact" as const, head: true };
  const monthStart = new Date();
  monthStart.setUTCDate(1);
  monthStart.setUTCHours(0, 0, 0, 0);
  const [members, products, offers, accounts, listings, imports] = await Promise.all([
    supabase.from("organization_members").select("id", head).eq("organization_id", organizationId),
    supabase.from("catalog_products").select("id", head).eq("organization_id", organizationId),
    supabase.from("supplier_offers").select("id", head).eq("organization_id", organizationId),
    supabase.from("marketplace_accounts").select("id", head).eq("organization_id", organizationId).neq("status", "disconnected"),
    supabase.from("marketplace_listings").select("id", head).eq("organization_id", organizationId).in("status", ["active", "paused", "under_review"]),
    supabase.from("catalog_import_runs").select("id", head).eq("organization_id", organizationId).gte("started_at", monthStart.toISOString()),
  ]);
  return {
    max_members: members.count ?? 0,
    max_products: products.count ?? 0,
    max_supplier_offers: offers.count ?? 0,
    max_marketplace_accounts: accounts.count ?? 0,
    max_active_listings: listings.count ?? 0,
    max_imports_per_month: imports.count ?? 0,
  };
}

export async function getCurrentPlan(supabase: UserSupabaseClient, organizationId: string) {
  const { data, error } = await supabase.rpc("organization_plan", { org: organizationId });
  if (error) throw error;
  return data?.[0] ?? null;
}
