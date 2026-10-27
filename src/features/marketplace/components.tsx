"use client";

import { RefreshCw, Unplug } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ActionForm } from "@/components/forms/action-form";
import { disconnectAccountAction, syncAccountAction } from "@/features/marketplace/actions";

export function AccountActions({ accountId, nickname }: { accountId: string; nickname: string }) {
  return (
    <div className="flex flex-wrap gap-2">
      <ActionForm action={syncAccountAction}>
        <input type="hidden" name="accountId" value={accountId} />
        <Button type="submit" variant="outline" size="sm">
          <RefreshCw aria-hidden /> Consultar conta
        </Button>
      </ActionForm>
      <ActionForm
        action={disconnectAccountAction}
        confirm={{
          title: `Desconectar ${nickname}?`,
          description: "Os tokens serão apagados e a sincronização de anúncios e pedidos desta conta será interrompida.",
          confirmLabel: "Desconectar",
        }}
      >
        <input type="hidden" name="accountId" value={accountId} />
        <Button type="submit" variant="destructive" size="sm">
          <Unplug aria-hidden /> Desconectar
        </Button>
      </ActionForm>
    </div>
  );
}
