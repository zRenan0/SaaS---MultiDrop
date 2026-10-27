import { AlertCircle, CheckCircle2 } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import type { ActionResult } from "@/server/errors";

export function FormStatus({ state }: { state: ActionResult<unknown> | null | undefined }) {
  if (!state) return null;
  if (state.ok && !state.message) return null;
  return (
    <Alert variant={state.ok ? "default" : "destructive"} role={state.ok ? "status" : "alert"}>
      {state.ok ? <CheckCircle2 aria-hidden /> : <AlertCircle aria-hidden />}
      <AlertDescription>{state.ok ? state.message : state.error}</AlertDescription>
    </Alert>
  );
}

export function fieldError(state: ActionResult<unknown> | null | undefined, field: string): string | undefined {
  if (!state || state.ok) return undefined;
  return state.fieldErrors?.[field]?.[0];
}
