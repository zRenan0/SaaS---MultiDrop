"use client";

import { createContext, useTransition } from "react";

export const FormPendingContext = createContext(false);

/**
 * Formulário para Server Actions com useActionState que NÃO limpa os campos após o envio
 * (o React 19 reseta formulários enviados via prop `action`, o que apagaria os dados digitados
 * quando a validação no servidor falha).
 */
export function ServerForm({
  action,
  pending,
  children,
  ...props
}: Omit<React.ComponentProps<"form">, "action" | "onSubmit"> & { action: (formData: FormData) => void; pending: boolean }) {
  const [, startTransition] = useTransition();
  return (
    <FormPendingContext value={pending}>
      <form
        {...props}
        aria-busy={pending}
        onSubmit={(event) => {
          event.preventDefault();
          const formData = new FormData(event.currentTarget);
          startTransition(() => action(formData));
        }}
      >
        {children}
      </form>
    </FormPendingContext>
  );
}
