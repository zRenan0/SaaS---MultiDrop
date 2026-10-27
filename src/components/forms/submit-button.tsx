"use client";

import { use } from "react";
import { useFormStatus } from "react-dom";
import { FormPendingContext } from "@/components/forms/server-form";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

export function SubmitButton({
  children,
  pendingText = "Salvando…",
  ...props
}: React.ComponentProps<typeof Button> & { pendingText?: string }) {
  const status = useFormStatus();
  const pending = status.pending || use(FormPendingContext);
  return (
    <Button type="submit" disabled={pending || props.disabled} aria-busy={pending} {...props}>
      {pending ? (
        <>
          <Loader2 className="animate-spin" aria-hidden />
          {pendingText}
        </>
      ) : (
        children
      )}
    </Button>
  );
}
