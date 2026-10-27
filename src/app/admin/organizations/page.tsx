import type { Metadata } from "next";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageHeader } from "@/components/layout/page-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { flatParams, pageNumber, Pagination } from "@/components/data/pagination";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatDateTime } from "@/lib/dates";
import { AssignPlanForm, OrganizationStatusForm } from "@/features/admin/components";
import { requirePlatformAdminPage } from "@/features/admin/guard";

export const metadata: Metadata = { title: "Empresas" };

const PAGE_SIZE = 25;

export default async function AdminOrganizationsPage({ searchParams }: PageProps<"/admin/organizations">) {
  await requirePlatformAdminPage();
  const params = flatParams(await searchParams);
  const page = pageNumber(params.page);
  const admin = createAdminClient();
  let query = admin
    .from("organizations")
    .select("id, name, slug, status, created_at, members:organization_members(count), subscriptions(plan_code, provider, status), accounts:marketplace_accounts(status)", { count: "exact" })
    .neq("status", "deleted");
  const q = (params.q ?? "").trim().slice(0, 80).replace(/[%,()]/g, "");
  if (q) query = query.or(`name.ilike.%${q}%,slug.ilike.%${q}%`);
  const [{ data, count }, { data: plans }] = await Promise.all([
    query.order("created_at", { ascending: false }).range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1),
    admin.from("plans").select("code, name").order("sort_order"),
  ]);

  return (
    <>
      <PageHeader title="Empresas" description="Ações aqui são registradas na auditoria do operador." />
      <form className="mb-4 flex gap-2" role="search">
        <Input name="q" defaultValue={params.q ?? ""} placeholder="Nome ou identificador" aria-label="Buscar empresa" className="w-64" />
        <Button type="submit" variant="secondary">Buscar</Button>
      </form>
      <Card>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Empresa</TableHead>
                <TableHead className="text-right">Membros</TableHead>
                <TableHead>Assinaturas ativas</TableHead>
                <TableHead>Contas ML</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Plano interno</TableHead>
                <TableHead>Acesso</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(data ?? []).map((o) => {
                const active = o.subscriptions.filter((s) => ["active", "trialing"].includes(s.status));
                const internal = o.subscriptions.find((s) => s.provider === "internal");
                return (
                  <TableRow key={o.id}>
                    <TableCell>
                      <div className="font-medium">{o.name}</div>
                      <div className="text-xs text-muted-foreground">{o.slug} · {formatDateTime(o.created_at)}</div>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{o.members[0]?.count ?? 0}</TableCell>
                    <TableCell className="text-sm">{active.map((s) => `${s.plan_code} (${s.provider})`).join(", ") || "—"}</TableCell>
                    <TableCell className="text-sm">{o.accounts.filter((a) => a.status === "active").length} ativa(s)</TableCell>
                    <TableCell>
                      <StatusBadge tone={o.status === "active" ? "success" : "danger"}>{o.status === "active" ? "Ativa" : "Suspensa"}</StatusBadge>
                    </TableCell>
                    <TableCell><AssignPlanForm organizationId={o.id} plans={plans ?? []} current={internal?.plan_code ?? null} /></TableCell>
                    <TableCell><OrganizationStatusForm organizationId={o.id} status={o.status} name={o.name} /></TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
          <Pagination pathname="/admin/organizations" params={params} page={page} pageSize={PAGE_SIZE} total={count ?? 0} />
        </CardContent>
      </Card>
    </>
  );
}
