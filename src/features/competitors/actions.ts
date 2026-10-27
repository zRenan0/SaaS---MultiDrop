"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { asJson, numeric } from "@/lib/db-values";
import { formDataToObject, parseInput, runAction } from "@/server/action";
import { describeDbError, type ActionResult } from "@/server/errors";
import { requirePermission } from "@/server/session";
import { getAccountForOrg } from "@/features/marketplace/accounts";
import { mlClientForAccount } from "@/server/integrations/mercado-livre/factory";
import { MlApiError } from "@/server/integrations/mercado-livre/http";
import { getCurrentPlan } from "@/features/billing/service";
import { hasFeature } from "@/features/billing/limits";

const LIMITATION =
  "Preços de anúncios ligados ao catálogo do Mercado Livre (endpoint /products/{id}/items). Não inclui anúncios fora do catálogo nem representa o custo do concorrente.";

/** Registra preços observados no catálogo oficial do Mercado Livre, com fonte, data e limitação. */
export async function searchCompetitorsAction(formData: FormData): Promise<ActionResult> {
  return runAction("competitors.search", async () => {
    const ctx = await requirePermission("catalog.write");
    const input = parseInput(z.object({ productId: z.uuid(), accountId: z.uuid("Selecione a conta.") }), formDataToObject(formData));
    const supabase = await createClient();
    const plan = await getCurrentPlan(supabase, ctx.organization.id);
    if (!hasFeature(plan?.features, "competitors")) return { ok: false, error: "A pesquisa de concorrentes não está incluída no seu plano. Veja Plano e uso." };
    const account = await getAccountForOrg(input.accountId, ctx.organization.id);
    if (account.status !== "active") return { ok: false, error: "Conta do Mercado Livre inativa." };
    const { data: product } = await supabase.from("catalog_products").select("id, title, gtin").eq("id", input.productId).eq("organization_id", ctx.organization.id).maybeSingle();
    if (!product) return { ok: false, error: "Produto não encontrado." };

    const client = mlClientForAccount(account.id, account.site_id);
    try {
      const search = await client.searchCatalogProducts(product.gtin ?? product.title);
      const candidates = search.results.slice(0, 3);
      if (candidates.length === 0) return { ok: true, message: "Nenhum produto equivalente encontrado no catálogo do Mercado Livre." };
      const rows = [];
      for (const candidate of candidates) {
        const items = await client.getCatalogProductItems(candidate.id);
        for (const item of items.results.slice(0, 20)) {
          if (item.seller_id === account.external_account_id) continue;
          rows.push({
            organization_id: ctx.organization.id,
            marketplace: "mercado_livre",
            external_item_id: item.item_id,
            catalog_product_id: product.id,
            title: candidate.name,
            seller_id: item.seller_id ?? null,
            observed_price: numeric(item.price.toFixed(2)),
            observed_shipping: null,
            currency: item.currency_id ?? "BRL",
            source: "ml_api",
            source_url: `/products/${candidate.id}/items`,
            metadata: asJson({ catalog_product_id: candidate.id, listing_type_id: item.listing_type_id ?? null, free_shipping: item.shipping?.free_shipping ?? null, limitation: LIMITATION }),
          });
        }
      }
      if (rows.length === 0) return { ok: true, message: "O catálogo não retornou anúncios de outros vendedores." };
      const { error } = await supabase.from("competitor_snapshots").insert(rows);
      if (error) return { ok: false, error: describeDbError(error) };
      revalidatePath(`/app/products/${product.id}`);
      return { ok: true, message: `${rows.length} preço(s) observado(s) registrados.` };
    } catch (error) {
      if (error instanceof MlApiError && error.status === 403) {
        return { ok: false, error: "O Mercado Livre negou acesso a este recurso para a sua aplicação (403). Veja docs/integrations.md." };
      }
      return { ok: false, error: error instanceof MlApiError ? `Mercado Livre respondeu ${error.status}: ${error.message}` : "Falha na consulta." };
    }
  });
}
