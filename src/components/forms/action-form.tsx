"use client";

import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import type { ActionResult } from "@/server/errors";

type Props = {
  action: (formData: FormData) => Promise<ActionResult<unknown>>;
  children: React.ReactNode;
  className?: string;
  /** Exige confirmação explícita antes de executar (ações importantes ou irreversíveis). */
  confirm?: { title: string; description: React.ReactNode; confirmLabel?: string };
  onSuccess?: (result: ActionResult<unknown>) => void;
};

/** Formulário que executa uma Server Action, mostra o resultado e opcionalmente pede confirmação. */
export function ActionForm({ action, children, className, confirm, onSuccess }: Props) {
  const formRef = useRef<HTMLFormElement>(null);
  const [pending, startTransition] = useTransition();
  const [confirmOpen, setConfirmOpen] = useState(false);

  function run(formData: FormData) {
    startTransition(async () => {
      const result = await action(formData);
      if (result.ok) {
        if (result.message) toast.success(result.message);
        onSuccess?.(result);
      } else {
        toast.error(result.error);
      }
    });
  }

  return (
    <>
      <form
        ref={formRef}
        className={className}
        aria-busy={pending}
        onSubmit={(event) => {
          event.preventDefault();
          if (confirm) setConfirmOpen(true);
          else run(new FormData(event.currentTarget));
        }}
      >
        <fieldset disabled={pending} className="contents">
          {children}
        </fieldset>
      </form>
      {confirm ? (
        <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{confirm.title}</AlertDialogTitle>
              <AlertDialogDescription asChild>
                <div>{confirm.description}</div>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => {
                  if (formRef.current) run(new FormData(formRef.current));
                }}
              >
                {confirm.confirmLabel ?? "Confirmar"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      ) : null}
    </>
  );
}
