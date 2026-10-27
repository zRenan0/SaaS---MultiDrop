import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { NotFoundError } from "@/server/errors";

/** Carrega a conta garantindo (via RLS do usuário) que pertence à organização ativa. */
export async function getAccountForOrg(accountId: string, organizationId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("marketplace_accounts")
    .select("id, organization_id, external_account_id, site_id, status, nickname, user_product_seller")
    .eq("id", accountId)
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (!data) throw new NotFoundError("Conta do Mercado Livre não encontrada.");
  return data;
}

export async function recordIntegrationError(params: {
  organizationId: string | null;
  entityType: string;
  entityId: string | null;
  code: string;
  message: string;
  retryable: boolean;
  context?: Record<string, unknown>;
}) {
  const admin = createAdminClient();
  await admin.from("integration_errors").insert({
    organization_id: params.organizationId,
    integration_type: "mercado_livre",
    entity_type: params.entityType,
    entity_id: params.entityId,
    error_code: params.code,
    message: params.message.slice(0, 2000),
    retryable: params.retryable,
    context: JSON.parse(JSON.stringify(params.context ?? {})),
  });
}
