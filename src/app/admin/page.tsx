import type { Metadata } from "next";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageHeader } from "@/components/layout/page-header";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatDateTime } from "@/lib/dates";
import { platformMetrics } from "@/features/admin/metrics";
import { AdminRetryJobButton } from "@/features/admin/components";
import { requirePlatformAdminPage } from "@/features/admin/guard";

export const metadata: Metadata = { title: "Operador" };

function Stat({ label, value, hint }: { label: string; value: React.ReactNode; hint?: string }) {
  return (
    <Card>
      <CardHeader>
        <CardDescription>{label}</CardDescription>
        <CardTitle className="text-2xl tabular-nums">{value}</CardTitle>
        {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
      </CardHeader>
    </Card>
  );
}

export default async function AdminHome() {
  await requirePlatformAdminPage();
  const admin = createAdminClient();
  const [m, { data: errors }, { data: deadJobs }] = await Promise.all([
    platformMetrics(admin),
    admin.from("integration_errors").select("id, message, error_code, occurred_at, organization:organizations(name)").is("resolved_at", null).order("occurred_at", { ascending: false }).limit(15),
    admin.from("sync_jobs").select("id, job_type, last_error, finished_at, organization:organizations(name)").eq("status", "dead").order("finished_at", { ascending: false }).limit(15),
  ]);

  return (
    <>
      <PageHeader title="Visão geral da plataforma" description="Métricas consultadas no banco a cada acesso (últimas 24 horas onde indicado)." />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Empresas ativas" value={m.organizations.active} hint={`${m.organizations.suspended} suspensa(s)`} />
        <Stat label="Usuários" value={m.users} />
        <Stat label="Contas ML ativas" value={m.accounts.active} hint={`${m.accounts.reauthorization_required} aguardando reautorização`} />
        <Stat label="Erros sem resolução" value={m.openErrors} />
        <Stat label="Tarefas concluídas (24h)" value={m.jobs24h.succeeded} hint={m.jobDurationMs ? `p50 ${m.jobDurationMs.p50} ms · p95 ${m.jobDurationMs.p95} ms` : "sem amostras"} />
        <Stat label="Fila pronta para executar" value={m.readyBacklog} hint={m.oldestPendingAt ? `mais antiga desde ${formatDateTime(m.oldestPendingAt)}` : undefined} />
        <Stat label="Tarefas esgotadas (24h)" value={m.jobs24h.dead} />
        <Stat label="Notificações (24h)" value={m.webhooks24h.processed + m.webhooks24h.queued + m.webhooks24h.ignored + m.webhooks24h.failed} hint={`${m.webhooks24h.failed} com falha · ${m.webhooks24h.ignored} ignoradas`} />
      </div>
      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Assinaturas ativas por plano</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="grid gap-1 text-sm">
              {Object.entries(m.subscriptionsByPlan).map(([k, v]) => (
                <li key={k} className="flex justify-between"><span>{k}</span><span className="tabular-nums">{v}</span></li>
              ))}
              {Object.keys(m.subscriptionsByPlan).length === 0 ? <li className="text-muted-foreground">Nenhuma.</li> : null}
            </ul>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Tarefas esgotadas</CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            {!deadJobs?.length ? (
              <p className="text-sm text-muted-foreground">Nenhuma.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Tarefa</TableHead>
                    <TableHead>Empresa</TableHead>
                    <TableHead>Erro</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {deadJobs.map((j) => (
                    <TableRow key={j.id}>
                      <TableCell className="font-mono text-xs">{j.job_type}</TableCell>
                      <TableCell className="text-sm">{j.organization?.name ?? "—"}</TableCell>
                      <TableCell className="max-w-xs truncate text-xs" title={j.last_error ?? undefined}>{j.last_error}</TableCell>
                      <TableCell><AdminRetryJobButton jobId={j.id} /></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Erros de integração recentes</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="divide-y text-sm">
              {(errors ?? []).map((e) => (
                <li key={e.id} className="grid gap-1 py-2">
                  <span className="text-xs text-muted-foreground">{formatDateTime(e.occurred_at)} · {e.organization?.name ?? "sem empresa"} · {e.error_code}</span>
                  <span>{e.message}</span>
                </li>
              ))}
              {!errors?.length ? <li className="text-muted-foreground">Nenhum.</li> : null}
            </ul>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
