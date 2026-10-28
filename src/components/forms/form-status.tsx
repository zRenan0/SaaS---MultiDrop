"use client";

import { useEffect, useRef } from "react";
import { AlertCircle, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription } from "@/components/ui/alert";
import type { ActionResult } from "@/server/errors";

/**
 * Resultado do último envio. Além do aviso no topo do formulário, mostra um toast no sucesso e rola até o aviso
 * quando ele está fora da tela (em formulários longos o botão Salvar fica longe da mensagem).
 */
export function FormStatus({ state }: { state: ActionResult<unknown> | null | undefined }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!state || (state.ok && !state.message)) return;
    if (state.ok && state.message) toast.success(state.message);
    const el = ref.current;
    if (!el) return;
    const { top, bottom } = el.getBoundingClientRect();
    if (top < 0 || bottom > window.innerHeight) el.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [state]);

  if (!state) return null;
  if (state.ok && !state.message) return null;
  return (
    <Alert ref={ref} variant={state.ok ? "default" : "destructive"} role={state.ok ? "status" : "alert"}>
      {state.ok ? <CheckCircle2 aria-hidden /> : <AlertCircle aria-hidden />}
      <AlertDescription>{state.ok ? state.message : state.error}</AlertDescription>
    </Alert>
  );
}

export function fieldError(state: ActionResult<unknown> | null | undefined, field: string): string | undefined {
  if (!state || state.ok) return undefined;
  return state.fieldErrors?.[field]?.[0];
}
