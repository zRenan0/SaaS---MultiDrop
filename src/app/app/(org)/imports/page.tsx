import type { Metadata } from "next";
import Link from "next/link";
import { FileSpreadsheet, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState, ErrorState } from "@/components/layout/states";
import { StatusBadge } from "@/components/ui/status-badge";
import { flatParams, pageNumber, Pagination } from "@/components/data/pagination";
import { createClient } from "@/lib/supabase/server";
import { formatDateTime } from "@/lib/dates";
import { can } from "@/features/organizations/roles";
import { requireOrgContext } from "@/server/session";
import { IMPORT_STATUS } from "@/features/catalog/import/status";

export const metadata: Metadata = { title: "Importações" };

const PAGE_SIZE = 20;

export default async function ImportsPage({ searchParams }: PageProps<"/app/imports">) {
  const ctx = await requireOrgContext();
  const params = flatParams(await searchParams);
  const page = pageNumber(params.page);
  const supabase = await createClient();
  const { data, count, error } = await supabase
    .from("catalog_import_runs")
    .select("id, file_name, file_type, status, rows_total, rows_imported, rows_updated, rows_rejected, started_at, finished_at, connection:supplier_connections(display_name)", { count: "exact" })
    .eq("organization_id", ctx.organization.id)
    .order("started_at", { ascending: false })
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);

  return (
    <>
      <PageHeader
        title="Importações"
        description="Histórico de arquivos importados, com linhas importadas, atualizadas e rejeitadas."
        actions={
          can(ctx.role, "imports.run") ? (
            <Button asChild>
              <Link href="/app/imports/new">
                <Plus aria-hidden /> Nova importação
              </Link>
            </Button>
          ) : null
        }
      />
      {error ? (
        <ErrorState />
      ) : !data || data.length === 0 ? (
        <EmptyState icon={FileSpreadsheet} title="Nenhuma importação" description="Importe produtos e ofertas a partir de uma planilha CSV ou Excel." />
      ) : (
        <Card>
          <CardContent className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Arquivo</TableHead>
                  <TableHead>Fornecedor</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Linhas</TableHead>
                  <TableHead className="text-right">Novas</TableHead>
                  <TableHead className="text-right">Atualizadas</TableHead>
                  <TableHead className="text-right">Rejeitadas</TableHead>
                  <TableHead>Início</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.map((run) => {
                  const [label, tone] = IMPORT_STATUS[run.status];
                  return (
                    <TableRow key={run.id}>
                      <TableCell>
                        <Link href={`/app/imports/${run.id}`} className="font-medium hover:underline">{run.file_name}</Link>
                      </TableCell>
                      <TableCell>{run.connection?.display_name}</TableCell>
                      <TableCell>
                        <StatusBadge tone={tone}>{label}</StatusBadge>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{run.rows_total}</TableCell>
                      <TableCell className="text-right tabular-nums">{run.rows_imported}</TableCell>
                      <TableCell className="text-right tabular-nums">{run.rows_updated}</TableCell>
                      <TableCell className="text-right tabular-nums">{run.rows_rejected}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{formatDateTime(run.started_at)}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
            <Pagination pathname="/app/imports" params={params} page={page} pageSize={PAGE_SIZE} total={count ?? 0} />
          </CardContent>
        </Card>
      )}
    </>
  );
}
