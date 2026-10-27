import "server-only";
import type { UserSupabaseClient } from "@/lib/supabase/server";
import { storedRulesSchema } from "@/features/pricing/schemas";
import type { PricingRules } from "@/features/pricing/engine";

export type ProfileWithRules = {
  id: string;
  name: string;
  isDefault: boolean;
  ruleVersionId: string;
  version: number;
  effectiveAt: string;
  rules: PricingRules;
};

/** Perfis da organização com a versão de regra mais recente de cada um. */
export async function loadProfiles(supabase: UserSupabaseClient, organizationId: string): Promise<ProfileWithRules[]> {
  const { data, error } = await supabase
    .from("pricing_profiles")
    .select("id, name, is_default, versions:pricing_rule_versions(id, version, rules, effective_at)")
    .eq("organization_id", organizationId)
    .order("is_default", { ascending: false })
    .order("name");
  if (error) throw error;
  const out: ProfileWithRules[] = [];
  for (const profile of data ?? []) {
    const latest = [...profile.versions].sort((a, b) => b.version - a.version)[0];
    if (!latest) continue;
    const parsed = storedRulesSchema.safeParse(latest.rules);
    if (!parsed.success) continue;
    out.push({
      id: profile.id,
      name: profile.name,
      isDefault: profile.is_default,
      ruleVersionId: latest.id,
      version: latest.version,
      effectiveAt: latest.effective_at,
      rules: parsed.data,
    });
  }
  return out;
}
