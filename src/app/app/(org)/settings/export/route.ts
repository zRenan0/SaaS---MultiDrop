import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { can } from "@/features/organizations/roles";
import { audit } from "@/server/audit";
import { getOrgContext } from "@/server/session";

/**
 * Exportação dos dados da empresa (portabilidade). Somente o proprietário. Usa o cliente do usuário (RLS):
 * nunca inclui tokens, credenciais ou dados de outras empresas.
 */
export async function GET() {
  const ctx = await getOrgContext();
  if (!ctx || !can(ctx.role, "billing.manage")) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const supabase = await createClient();
  const org = ctx.organization.id;
  const tables = [
    "organization_members",
    "supplier_connections",
    "catalog_products",
    "supplier_offers",
    "catalog_import_runs",
    "competitor_snapshots",
    "pricing_profiles",
    "pricing_rule_versions",
    "pricing_calculations",
    "marketplace_accounts",
    "listing_drafts",
    "marketplace_listings",
    "orders",
    "order_items",
    "supplier_purchase_orders",
    "shipments",
    "subscriptions",
    "audit_logs",
  ] as const;
  const result: Record<string, unknown> = {
    exported_at: new Date().toISOString(),
    organization: { id: org, name: ctx.organization.name, slug: ctx.organization.slug },
  };
  for (const table of tables) {
    const { data, error } = await supabase.from(table).select("*").eq("organization_id", org).limit(50_000);
    result[table] = error ? { error: "não exportado" } : data;
  }
  await audit({ organizationId: org, actorUserId: ctx.user.id, action: "organization.export", entityType: "organization", entityId: org });
  return new NextResponse(JSON.stringify(result, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="exportacao-${ctx.organization.slug}-${new Date().toISOString().slice(0, 10)}.json"`,
      "Cache-Control": "no-store",
    },
  });
}
