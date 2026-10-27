"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ActionForm } from "@/components/forms/action-form";
import { adminRetryJobAction, assignInternalPlanAction, setOrganizationStatusAction } from "@/features/admin/actions";

export function OrganizationStatusForm({ organizationId, status, name }: { organizationId: string; status: string; name: string }) {
  const [reason, setReason] = useState("");
  const next = status === "suspended" ? "active" : "suspended";
  return (
    <ActionForm
      action={setOrganizationStatusAction}
      className="flex items-center gap-2"
      confirm={{ title: `${next === "suspended" ? "Suspender" : "Reativar"} ${name}?`, description: next === "suspended" ? "Todos os membros perdem o acesso até a reativação. Dados são mantidos." : "Os membros voltam a ter acesso." }}
    >
      <input type="hidden" name="organizationId" value={organizationId} />
      <input type="hidden" name="status" value={next} />
      <Input name="reason" aria-label="Motivo" placeholder="Motivo" value={reason} onChange={(e) => setReason(e.target.value)} className="h-7 w-36" />
      <Button type="submit" size="sm" variant={next === "suspended" ? "destructive" : "outline"} disabled={reason.trim().length < 3}>
        {next === "suspended" ? "Suspender" : "Reativar"}
      </Button>
    </ActionForm>
  );
}

export function AssignPlanForm({ organizationId, plans, current }: { organizationId: string; plans: { code: string; name: string }[]; current: string | null }) {
  const [plan, setPlan] = useState(current ?? plans[0]?.code ?? "");
  return (
    <ActionForm action={assignInternalPlanAction} className="flex items-center gap-2">
      <input type="hidden" name="organizationId" value={organizationId} />
      <select name="planCode" aria-label="Plano interno" value={plan} onChange={(e) => setPlan(e.target.value)} className="h-7 rounded-lg border bg-background px-2 text-sm">
        {plans.map((p) => <option key={p.code} value={p.code}>{p.name}</option>)}
      </select>
      <Button type="submit" size="sm" variant="outline">Aplicar</Button>
    </ActionForm>
  );
}

export function AdminRetryJobButton({ jobId }: { jobId: string }) {
  return (
    <ActionForm action={adminRetryJobAction}>
      <input type="hidden" name="jobId" value={jobId} />
      <Button type="submit" size="sm" variant="outline">Reprocessar</Button>
    </ActionForm>
  );
}
