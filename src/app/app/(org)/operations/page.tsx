import type { Metadata } from "next";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageHeader } from "@/components/layout/page-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { createClient } from "@/lib/supabase/server";
import { formatDateTime } from "@/lib/dates";
import { ResolveErrorButton, RetryJobButton } from "@/features/operations/components";
import { can } from "@/features/organizations/roles";
import { requireOrgContext } from "@/server/session";

export const metadata: Metadata = { title: "Operações e erros" };

const JOB_STATUS = { pending: ["Pendente", "neutral"], running: ["Executando", "info"], succeeded: ["Concluída", "success"], failed: ["Falhou", "danger"], dead: ["Esgotada", "danger"] } as const;
const EVENT_STATUS: Record<string, "neutral" | "info" | "success" | "danger" | "warning"> = { received: "neutral", queued: "info", processed: "success", ignored: "neutral", failed: "danger" };

export default async function OperationsPage() {
  const ctx = await requireOrgContext();
  const supabase = await createClient();
  const org = ctx.organization.id;
  const isAdmin = can(ctx.role, "operations.retry");
  const [errors, jobs, events] = await Promise.all([
    supabase.from("integration_errors").select("id, integration_type, entity_type, error_code, message, retryable, occurred_at").eq("organization_id", org).is("resolved_at", null).order("occurred_at", { ascending: false }).limit(50),
    supabase.from("sync_jobs").select("id, job_type, status, attempts, max_attempts, available_at, started_at, finished_at, duration_ms, last_error, created_at").eq("organization_id", org).order("created_at", { ascending: false }).limit(50),
    isAdmin
      ? supabase.from("webhook_events").select("id, topic, resource, status, attempts, received_at, processed_at, last_error").eq("organization_id", org).order("received_at", { ascending: false }).limit(50)
      : Promise.resolve({ data: [] as never[] }),
  ]);

  return (
    <>
      <PageHeader title="Operações e erros" description="Falhas de integração, fila de processamento e notificações recebidas. Tudo aqui vem do banco; nada é ocultado." />
      <div className="grid gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Erros sem resolução ({errors.data?.length ?? 0})</CardTitle>
            <CardDescription>Revise a causa, corrija na origem (conta, oferta, anúncio) e marque como resolvido.</CardDescription>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            {!errors.data?.length ? (
              <p className="text-sm text-muted-foreground">Nenhum erro pendente.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Quando</TableHead>
                    <TableHead>Origem</TableHead>
                    <TableHead>Mensagem</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {errors.data.map((e) => (
                    <TableRow key={e.id}>
                      <TableCell className="text-sm whitespace-nowrap text-muted-foreground">{formatDateTime(e.occurred_at)}</TableCell>
                      <TableCell className="text-sm">
                        {e.integration_type} · {e.entity_type}
                        <div className="font-mono text-xs text-muted-foreground">{e.error_code}</div>
                      </TableCell>
                      <TableCell className="max-w-xl text-sm whitespace-normal">{e.message}</TableCell>
                      <TableCell>{can(ctx.role, "orders.forward") ? <ResolveErrorButton errorId={e.id} /> : null}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Fila de tarefas</CardTitle>
            <CardDescription>Execução a cada 5 minutos (agendador) e logo após notificações. Falhas temporárias são repetidas com espera crescente.</CardDescription>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            {!jobs.data?.length ? (
              <p className="text-sm text-muted-foreground">Nenhuma tarefa registrada.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Tarefa</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Tentativas</TableHead>
                    <TableHead className="text-right">Duração</TableHead>
                    <TableHead>Criada</TableHead>
                    <TableHead>Último erro</TableHead>
                    {isAdmin ? <TableHead /> : null}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {jobs.data.map((j) => {
                    const [label, tone] = JOB_STATUS[j.status];
                    return (
                      <TableRow key={j.id}>
                        <TableCell className="font-mono text-xs">{j.job_type}</TableCell>
                        <TableCell>
                          <StatusBadge tone={tone}>{label}</StatusBadge>
                          {j.status === "pending" && j.attempts > 0 ? <div className="text-xs text-muted-foreground">próxima: {formatDateTime(j.available_at)}</div> : null}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{j.attempts}/{j.max_attempts}</TableCell>
                        <TableCell className="text-right tabular-nums">{j.duration_ms === null ? "—" : `${j.duration_ms} ms`}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{formatDateTime(j.created_at)}</TableCell>
                        <TableCell className="max-w-sm truncate text-xs" title={j.last_error ?? undefined}>{j.last_error ?? "—"}</TableCell>
                        {isAdmin ? <TableCell>{j.status === "dead" || j.status === "failed" ? <RetryJobButton jobId={j.id} /> : null}</TableCell> : null}
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {isAdmin ? (
          <Card>
            <CardHeader>
              <CardTitle>Notificações recebidas</CardTitle>
              <CardDescription>Últimas 50 notificações do Mercado Livre associadas às contas da empresa.</CardDescription>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              {!events.data?.length ? (
                <p className="text-sm text-muted-foreground">Nenhuma notificação recebida.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Recebida</TableHead>
                      <TableHead>Tópico</TableHead>
                      <TableHead>Recurso</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Erro</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {events.data.map((e) => (
                      <TableRow key={e.id}>
                        <TableCell className="text-sm text-muted-foreground">{formatDateTime(e.received_at)}</TableCell>
                        <TableCell className="font-mono text-xs">{e.topic}</TableCell>
                        <TableCell className="font-mono text-xs">{e.resource}</TableCell>
                        <TableCell><StatusBadge tone={EVENT_STATUS[e.status] ?? "neutral"}>{e.status}</StatusBadge></TableCell>
                        <TableCell className="max-w-xs truncate text-xs">{e.last_error ?? "—"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        ) : null}
      </div>
    </>
  );
}
