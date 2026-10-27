"use client";

import { useActionState, useState } from "react";
import { Copy } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Field } from "@/components/forms/field";
import { FormStatus, fieldError } from "@/components/forms/form-status";
import { SubmitButton } from "@/components/forms/submit-button";
import { ActionForm } from "@/components/forms/action-form";
import {
  inviteMemberAction,
  removeMemberAction,
  revokeInvitationAction,
  updateMemberRoleAction,
  updateOrganizationAction,
} from "@/features/organizations/actions";
import { ROLE_LABELS, type Role } from "@/features/organizations/roles";

export function OrganizationNameForm({ name, disabled }: { name: string; disabled: boolean }) {
  const [state, action] = useActionState(updateOrganizationAction, null);
  return (
    <form action={action} className="grid max-w-md gap-3">
      <FormStatus state={state} />
      <Field label="Nome da empresa" htmlFor="org-name" error={fieldError(state, "name")}>
        <Input id="org-name" name="name" defaultValue={name} disabled={disabled} required />
      </Field>
      {disabled ? null : (
        <div>
          <SubmitButton>Salvar</SubmitButton>
        </div>
      )}
    </form>
  );
}

export function InviteMemberForm() {
  const [state, action] = useActionState(inviteMemberAction, null);
  const [role, setRole] = useState<Role>("operator");
  const inviteUrl = state?.ok ? state.data?.inviteUrl : undefined;
  return (
    <form action={action} className="grid gap-3">
      <FormStatus state={state} />
      <div className="grid gap-3 sm:grid-cols-[1fr_180px_auto] sm:items-end">
        <Field label="E-mail do convidado" htmlFor="invite-email" error={fieldError(state, "email")}>
          <Input id="invite-email" name="email" type="email" required />
        </Field>
        <Field label="Papel" htmlFor="invite-role">
          <input type="hidden" name="role" value={role} />
          <Select value={role} onValueChange={(v) => setRole(v as Role)}>
            <SelectTrigger id="invite-role" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(["admin", "operator", "viewer"] as const).map((r) => (
                <SelectItem key={r} value={r}>{ROLE_LABELS[r]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <SubmitButton pendingText="Criando…">Convidar</SubmitButton>
      </div>
      {inviteUrl ? (
        <div className="flex items-center gap-2 rounded-md border bg-muted/50 p-2">
          <code className="min-w-0 flex-1 truncate text-xs" data-testid="invite-url">{inviteUrl}</code>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => navigator.clipboard.writeText(inviteUrl).then(() => toast.success("Link copiado."))}
          >
            <Copy aria-hidden /> Copiar
          </Button>
        </div>
      ) : null}
    </form>
  );
}

export function MemberRoleForm({ memberId, role }: { memberId: string; role: Role }) {
  const [value, setValue] = useState<Role>(role);
  return (
    <ActionForm action={updateMemberRoleAction} className="flex items-center gap-2">
      <input type="hidden" name="memberId" value={memberId} />
      <input type="hidden" name="role" value={value} />
      <Select value={value} onValueChange={(v) => setValue(v as Role)}>
        <SelectTrigger className="h-8 w-36" aria-label="Papel do membro">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {(["admin", "operator", "viewer"] as const).map((r) => (
            <SelectItem key={r} value={r}>{ROLE_LABELS[r]}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button type="submit" size="sm" variant="outline" disabled={value === role}>Salvar</Button>
    </ActionForm>
  );
}

export function RemoveMemberForm({ memberId, label }: { memberId: string; label: string }) {
  return (
    <ActionForm
      action={removeMemberAction}
      confirm={{ title: "Remover membro?", description: `${label} perderá o acesso a esta empresa imediatamente.`, confirmLabel: "Remover" }}
    >
      <input type="hidden" name="memberId" value={memberId} />
      <Button type="submit" size="sm" variant="destructive">Remover</Button>
    </ActionForm>
  );
}

export function RevokeInvitationForm({ invitationId }: { invitationId: string }) {
  return (
    <ActionForm action={revokeInvitationAction}>
      <input type="hidden" name="invitationId" value={invitationId} />
      <Button type="submit" size="sm" variant="ghost">Revogar</Button>
    </ActionForm>
  );
}
