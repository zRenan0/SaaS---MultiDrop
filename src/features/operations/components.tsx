"use client";

import { Button } from "@/components/ui/button";
import { ActionForm } from "@/components/forms/action-form";
import { resolveIntegrationErrorAction, retryJobAction } from "@/features/operations/actions";

export function ResolveErrorButton({ errorId }: { errorId: string }) {
  return (
    <ActionForm action={resolveIntegrationErrorAction}>
      <input type="hidden" name="errorId" value={errorId} />
      <Button type="submit" size="sm" variant="ghost">Marcar resolvido</Button>
    </ActionForm>
  );
}

export function RetryJobButton({ jobId }: { jobId: string }) {
  return (
    <ActionForm action={retryJobAction} confirm={{ title: "Reprocessar tarefa?", description: "A tarefa volta para a fila com as tentativas zeradas. Operações são idempotentes." }}>
      <input type="hidden" name="jobId" value={jobId} />
      <Button type="submit" size="sm" variant="outline">Reprocessar</Button>
    </ActionForm>
  );
}
