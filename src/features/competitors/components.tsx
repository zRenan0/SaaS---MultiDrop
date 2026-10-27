"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ActionForm } from "@/components/forms/action-form";
import { searchCompetitorsAction } from "@/features/competitors/actions";

export function CompetitorSearchForm({ productId, accounts }: { productId: string; accounts: { id: string; label: string }[] }) {
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? "");
  return (
    <ActionForm action={searchCompetitorsAction} className="flex flex-wrap items-end gap-2">
      <input type="hidden" name="productId" value={productId} />
      <label className="grid gap-1 text-xs text-muted-foreground">
        Conta usada na consulta
        <select name="accountId" value={accountId} onChange={(e) => setAccountId(e.target.value)} className="h-8 rounded-lg border bg-background px-2 text-sm text-foreground">
          {accounts.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
        </select>
      </label>
      <Button type="submit" variant="outline">Pesquisar preços no catálogo</Button>
    </ActionForm>
  );
}
