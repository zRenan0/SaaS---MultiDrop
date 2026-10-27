import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/layout/states";
import { createClient } from "@/lib/supabase/server";
import { ImportWizard } from "@/features/catalog/components/import-wizard";
import { can } from "@/features/organizations/roles";
import { requireOrgContext } from "@/server/session";

export const metadata: Metadata = { title: "Importar planilha" };

export default async function NewImportPage() {
  const ctx = await requireOrgContext();
  if (!can(ctx.role, "imports.run")) return <EmptyState title="Sem permissão" description="Seu papel não permite importar catálogo." />;
  const supabase = await createClient();
  const { data: connections } = await supabase
    .from("supplier_connections")
    .select("id, display_name")
    .eq("organization_id", ctx.organization.id)
    .neq("status", "disabled")
    .order("display_name");
  return (
    <>
      <PageHeader
        title="Importar planilha"
        description="Produtos com o mesmo SKU no mesmo fornecedor têm a oferta atualizada; produtos com o mesmo GTIN (ou mesmo título, marca e modelo) são reaproveitados."
      />
      {!connections || connections.length === 0 ? (
        <EmptyState
          title="Cadastre um fornecedor primeiro"
          action={
            <Button asChild>
              <Link href="/app/suppliers">Cadastrar fornecedor</Link>
            </Button>
          }
        />
      ) : (
        <ImportWizard connections={connections} />
      )}
    </>
  );
}
