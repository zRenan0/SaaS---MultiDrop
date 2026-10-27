import type { Metadata } from "next";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/layout/states";
import { createClient } from "@/lib/supabase/server";
import { NewProductForm } from "@/features/catalog/components/product-forms";
import { can } from "@/features/organizations/roles";
import { requireOrgContext } from "@/server/session";

export const metadata: Metadata = { title: "Novo produto" };

export default async function NewProductPage() {
  const ctx = await requireOrgContext();
  if (!can(ctx.role, "catalog.write")) {
    return <EmptyState title="Sem permissão" description="Seu papel permite apenas consultar o catálogo." />;
  }
  const supabase = await createClient();
  const { data: connections } = await supabase
    .from("supplier_connections")
    .select("id, display_name")
    .eq("organization_id", ctx.organization.id)
    .neq("status", "disabled")
    .order("display_name");
  return (
    <>
      <PageHeader title="Novo produto" description="Cadastro manual de produto e da oferta de um fornecedor. Se o SKU já existir para o fornecedor, a oferta é atualizada." />
      {!connections || connections.length === 0 ? (
        <EmptyState
          title="Cadastre um fornecedor primeiro"
          description="Toda oferta pertence a um fornecedor."
          action={
            <Button asChild>
              <Link href="/app/suppliers">Cadastrar fornecedor</Link>
            </Button>
          }
        />
      ) : (
        <Card>
          <CardContent>
            <NewProductForm connections={connections} />
          </CardContent>
        </Card>
      )}
    </>
  );
}
