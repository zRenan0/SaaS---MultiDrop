"use client";

import { Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ActionForm } from "@/components/forms/action-form";
import { saveSimulationAction } from "@/features/pricing/actions";

export function SaveSimulationButton({ productId, offerId, profileId, price, label }: { productId: string; offerId: string; profileId: string; price?: string; label: string }) {
  return (
    <ActionForm action={saveSimulationAction}>
      <input type="hidden" name="productId" value={productId} />
      <input type="hidden" name="offerId" value={offerId} />
      <input type="hidden" name="profileId" value={profileId} />
      {price ? <input type="hidden" name="price" value={price} /> : null}
      <Button type="submit" variant="outline" size="sm">
        <Save aria-hidden /> {label}
      </Button>
    </ActionForm>
  );
}
