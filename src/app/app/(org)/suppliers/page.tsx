import type { Metadata } from "next";
import { Truck } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState, ErrorState } from "@/components/layout/states";
import { StatusBadge } from "@/components/ui/status-badge";
import { createClient } from "@/lib/supabase/server";
import { can } from "@/features/organizations/roles";
import { SupplierConnectionForm, SupplierStatusButton } from "@/features/catalog/components/supplier-forms";
import { getSupplierAdapter } from "@/server/integrations/suppliers/registry";
import { requireOrgContext } from "@/server/session";

export const metadata: Metadata = { title: "Fornecedores" };

const STATUS = { active: ["Ativo", "success"], pending: ["Pendente de configuração", "warning"], error: ["Com erro", "danger"], disabled: ["Desativado", "neutral"] } as const;

export default async function SuppliersPage() {
  const ctx = await requireOrgContext();
  const supabase = await createClient();
  const [sources, connections] = await Promise.all([
    supabase.from("supplier_sources").select("id, name, adapter_key, status, description").order("name"),
    supabase
      .from("supplier_connections")
      .select("id, display_name, status, configuration, dropship_agreement_confirmed, created_at, source:supplier_sources(name, adapter_key), offers:supplier_offers(count)")
      .eq("organization_id", ctx.organization.id)
      .order("display_name"),
  ]);
  const canManage = can(ctx.role, "suppliers.manage");

  return (
    <>
      <PageHeader title="Fornecedores" description="Fontes de mercadoria da empresa. Nunca presuma que um fornecedor aceita despacho direto sem acordo registrado." />
      <div className="grid gap-6">
        {connections.error ? (
          <ErrorState description="Recarregue a página. Se persistir, verifique a conexão com o banco." />
        ) : connections.data.length === 0 ? (
          <EmptyState icon={Truck} title="Nenhum fornecedor cadastrado" description="Cadastre o primeiro fornecedor para começar a montar o catálogo manualmente ou por planilha." />
        ) : (
          <Card>
            <CardContent className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Fornecedor</TableHead>
                    <TableHead>Integração</TableHead>
                    <TableHead>Acordo de despacho</TableHead>
                    <TableHead className="text-right">Ofertas</TableHead>
                    <TableHead>Status</TableHead>
                    {canManage ? <TableHead className="text-right">Ações</TableHead> : null}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {connections.data.map((c) => {
                    const [label, tone] = STATUS[c.status];
                    const adapter = c.source ? getSupplierAdapter(c.source.adapter_key) : null;
                    const config = (c.configuration ?? {}) as Record<string, string | null>;
                    return (
                      <TableRow key={c.id}>
                        <TableCell>
                          <div className="font-medium">{c.display_name}</div>
                          <div className="text-xs text-muted-foreground">{[config.contact_name, config.contact_email, config.contact_phone].filter(Boolean).join(" · ")}</div>
                        </TableCell>
                        <TableCell>
                          <div>{c.source?.name}</div>
                          {adapter ? (
                            <div className="text-xs text-muted-foreground">
                              {adapter.capabilities.has("create_order") ? "Pedidos via API" : "Pedidos encaminhados manualmente"}
                            </div>
                          ) : null}
                        </TableCell>
                        <TableCell>
                          {c.dropship_agreement_confirmed ? <StatusBadge tone="success">Confirmado</StatusBadge> : <StatusBadge tone="warning">Não confirmado</StatusBadge>}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{c.offers[0]?.count ?? 0}</TableCell>
                        <TableCell>
                          <StatusBadge tone={tone}>{label}</StatusBadge>
                        </TableCell>
                        {canManage ? (
                          <TableCell className="text-right">
                            <SupplierStatusButton connectionId={c.id} status={c.status} />
                          </TableCell>
                        ) : null}
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}

        {canManage ? (
          <Card>
            <CardHeader>
              <CardTitle>Novo fornecedor</CardTitle>
              <CardDescription>
                Integrações por API só ficam ativas após verificação de documentação, contrato e credenciais do fornecedor.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <SupplierConnectionForm sources={sources.data ?? []} />
            </CardContent>
          </Card>
        ) : null}

        {(sources.data ?? [])
          .filter((s) => s.status !== "available")
          .map((s) => {
            const adapter = getSupplierAdapter(s.adapter_key);
            return (
              <Card key={s.id}>
                <CardHeader>
                  <CardTitle className="text-base">{s.name}: como ativar</CardTitle>
                  <CardDescription>Esta integração está identificada como não configurada.</CardDescription>
                </CardHeader>
                <CardContent>
                  <ol className="list-decimal space-y-1 pl-5 text-sm text-muted-foreground">
                    {adapter?.activationSteps().map((step) => <li key={step}>{step}</li>)}
                  </ol>
                </CardContent>
              </Card>
            );
          })}
      </div>
    </>
  );
}
