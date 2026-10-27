import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageHeader } from "@/components/layout/page-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { createClient } from "@/lib/supabase/server";
import { formatDateTime } from "@/lib/dates";
import { IMPORT_STATUS } from "@/features/catalog/import/status";
import { IMPORT_FIELDS, type ImportField } from "@/features/catalog/import/mapping";
import type { RowError } from "@/features/catalog/import/validate";
import { requireOrgContext } from "@/server/session";

export const metadata: Metadata = { title: "Relatório de importação" };

export default async function ImportRunPage({ params }: PageProps<"/app/imports/[id]">) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const ctx = await requireOrgContext();
  const supabase = await createClient();
  const { data: run } = await supabase
    .from("catalog_import_runs")
    .select("*, connection:supplier_connections(display_name)")
    .eq("id", id)
    .eq("organization_id", ctx.organization.id)
    .maybeSingle();
  if (!run) notFound();
  const [label, tone] = IMPORT_STATUS[run.status];
  const errors = (Array.isArray(run.errors) ? run.errors : []) as RowError[];
  const mapping = (run.column_mapping ?? {}) as Partial<Record<ImportField, number>>;

  return (
    <>
      <PageHeader
        title={run.file_name}
        description={`Fornecedor ${run.connection?.display_name ?? "—"} · iniciado em ${formatDateTime(run.started_at)}${run.finished_at ? ` · concluído em ${formatDateTime(run.finished_at)}` : ""}`}
        actions={
          <>
            {errors.length > 0 ? (
              <Button variant="outline" asChild>
                <a href={`/app/imports/${run.id}/errors`} download>
                  <Download aria-hidden /> Baixar linhas rejeitadas
                </a>
              </Button>
            ) : null}
            <Button asChild>
              <Link href="/app/imports/new">Importar novamente</Link>
            </Button>
          </>
        }
      />
      <div className="grid gap-6">
        <Card>
          <CardContent className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-6">
            <div>
              <p className="text-muted-foreground">Status</p>
              <StatusBadge tone={tone}>{label}</StatusBadge>
            </div>
            {[
              ["Linhas", run.rows_total],
              ["Processadas", run.rows_processed],
              ["Novas ofertas", run.rows_imported],
              ["Atualizadas", run.rows_updated],
              ["Rejeitadas", run.rows_rejected],
            ].map(([l, v]) => (
              <div key={l}>
                <p className="text-muted-foreground">{l}</p>
                <p className="text-lg font-semibold tabular-nums">{v}</p>
              </div>
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Mapeamento usado</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            {Object.entries(mapping).map(([field, col]) => `${IMPORT_FIELDS[field as ImportField]?.label ?? field} ← coluna ${Number(col) + 1}`).join(" · ") || "—"}
          </CardContent>
        </Card>
        {errors.length > 0 ? (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Problemas encontrados ({errors.length})</CardTitle>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Linha</TableHead>
                    <TableHead>Campo</TableHead>
                    <TableHead>Problema</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {errors.map((e, i) => (
                    <TableRow key={i}>
                      <TableCell>{e.row || "—"}</TableCell>
                      <TableCell>{e.field}</TableCell>
                      <TableCell>{e.message}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        ) : null}
      </div>
    </>
  );
}
