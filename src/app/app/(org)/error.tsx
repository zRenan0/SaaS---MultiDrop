"use client";

import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function OrgError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div role="alert" className="mx-auto mt-10 grid max-w-lg gap-4 rounded-xl border border-destructive/40 bg-destructive/5 p-6">
      <div className="flex items-center gap-2 font-medium">
        <AlertTriangle className="size-5 text-destructive" aria-hidden /> Não foi possível carregar esta página
      </div>
      <p className="text-sm text-muted-foreground">
        Tente novamente. Se o problema continuar, informe ao suporte o código {error.digest ? <span className="font-mono">{error.digest}</span> : "exibido nos registros"} e o horário.
      </p>
      <div>
        <Button onClick={reset}>Tentar novamente</Button>
      </div>
    </div>
  );
}
