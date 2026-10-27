import type { Metadata } from "next";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageHeader } from "@/components/layout/page-header";
import { ErrorState } from "@/components/layout/states";
import { StatusBadge } from "@/components/ui/status-badge";
import { createClient } from "@/lib/supabase/server";
import { formatDateTime } from "@/lib/dates";
import { can, ROLE_LABELS } from "@/features/organizations/roles";
import {
  InviteMemberForm,
  MemberRoleForm,
  OrganizationNameForm,
  RemoveMemberForm,
  RevokeInvitationForm,
} from "@/features/organizations/settings-forms";
import { requireOrgContext } from "@/server/session";

export const metadata: Metadata = { title: "Configurações" };

export default async function SettingsPage() {
  const ctx = await requireOrgContext();
  const supabase = await createClient();
  const canManage = can(ctx.role, "members.manage");

  const [members, invitations, auditLogs] = await Promise.all([
    supabase
      .from("organization_members")
      .select("id, role, user_id, created_at, profile:profiles(email, full_name)")
      .eq("organization_id", ctx.organization.id)
      .order("created_at"),
    canManage
      ? supabase
          .from("organization_invitations")
          .select("id, email, role, expires_at, created_at")
          .eq("organization_id", ctx.organization.id)
          .is("accepted_at", null)
          .order("created_at", { ascending: false })
      : Promise.resolve({ data: [], error: null }),
    can(ctx.role, "audit.view")
      ? supabase
          .from("audit_logs")
          .select("id, action, entity_type, entity_id, created_at, actor_user_id")
          .eq("organization_id", ctx.organization.id)
          .order("created_at", { ascending: false })
          .limit(25)
      : Promise.resolve({ data: [], error: null }),
  ]);

  return (
    <>
      <PageHeader title="Configurações" description="Dados da empresa, membros, convites e auditoria." />
      <div className="grid gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Empresa</CardTitle>
            <CardDescription>Identificador: {ctx.organization.slug}</CardDescription>
          </CardHeader>
          <CardContent>
            <OrganizationNameForm name={ctx.organization.name} disabled={!can(ctx.role, "organization.update")} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Membros</CardTitle>
            <CardDescription>Papéis: Proprietário e Administrador gerenciam a empresa; Operador opera catálogo, anúncios e pedidos; Leitura apenas consulta.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            {members.error ? (
              <ErrorState description="Tente recarregar a página." />
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Membro</TableHead>
                      <TableHead>Papel</TableHead>
                      <TableHead>Desde</TableHead>
                      <TableHead className="text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {members.data.map((m) => {
                      const label = m.profile?.full_name || m.profile?.email || "Usuário";
                      const editable = canManage && m.role !== "owner" && m.user_id !== ctx.user.id;
                      return (
                        <TableRow key={m.id}>
                          <TableCell>
                            <div className="font-medium">{label}</div>
                            <div className="text-xs text-muted-foreground">{m.profile?.email}</div>
                          </TableCell>
                          <TableCell>
                            {editable ? <MemberRoleForm memberId={m.id} role={m.role} /> : <StatusBadge>{ROLE_LABELS[m.role]}</StatusBadge>}
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">{formatDateTime(m.created_at)}</TableCell>
                          <TableCell className="text-right">{editable ? <RemoveMemberForm memberId={m.id} label={label} /> : null}</TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
            {canManage ? (
              <div className="grid gap-3 border-t pt-4">
                <h3 className="text-sm font-medium">Convidar membro</h3>
                <InviteMemberForm />
                {invitations.data && invitations.data.length > 0 ? (
                  <ul className="divide-y rounded-md border">
                    {invitations.data.map((inv) => (
                      <li key={inv.id} className="flex flex-wrap items-center justify-between gap-2 p-3 text-sm">
                        <span>
                          {inv.email} · {ROLE_LABELS[inv.role]} · expira {formatDateTime(inv.expires_at)}
                        </span>
                        <RevokeInvitationForm invitationId={inv.id} />
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            ) : null}
          </CardContent>
        </Card>

        {can(ctx.role, "billing.manage") ? (
          <Card>
            <CardHeader>
              <CardTitle>Dados da empresa</CardTitle>
              <CardDescription>
                Exporte todos os dados da empresa em JSON (portabilidade). Tokens e credenciais nunca são exportados. Para excluir a empresa e
                seus dados, solicite ao suporte: a exclusão é definitiva.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <a href="/app/settings/export" className="text-sm font-medium text-primary underline-offset-4 hover:underline" download>
                Baixar exportação (JSON)
              </a>
            </CardContent>
          </Card>
        ) : null}

        {can(ctx.role, "audit.view") ? (
          <Card>
            <CardHeader>
              <CardTitle>Auditoria recente</CardTitle>
              <CardDescription>Últimas 25 ações sensíveis registradas.</CardDescription>
            </CardHeader>
            <CardContent>
              {auditLogs.data && auditLogs.data.length > 0 ? (
                <ul className="divide-y text-sm">
                  {auditLogs.data.map((log) => (
                    <li key={log.id} className="flex flex-wrap justify-between gap-2 py-2">
                      <span className="font-mono text-xs">{log.action}</span>
                      <span className="text-muted-foreground">{log.entity_type}</span>
                      <span className="text-muted-foreground">{formatDateTime(log.created_at)}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground">Nenhuma ação registrada ainda.</p>
              )}
            </CardContent>
          </Card>
        ) : null}
      </div>
    </>
  );
}
