"use client";

import { useActionState, useState } from "react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Field } from "@/components/forms/field";
import { FormStatus, fieldError } from "@/components/forms/form-status";
import { SubmitButton } from "@/components/forms/submit-button";
import { ServerForm } from "@/components/forms/server-form";
import { ActionForm } from "@/components/forms/action-form";
import { createSupplierConnectionAction, setSupplierConnectionStatusAction } from "@/features/catalog/actions";

type Source = { id: string; name: string; status: string; description: string | null };

export function SupplierConnectionForm({ sources }: { sources: Source[] }) {
  const [state, action, pending] = useActionState(createSupplierConnectionAction, null);
  const [sourceId, setSourceId] = useState(sources.find((s) => s.status === "available")?.id ?? "");
  const selected = sources.find((s) => s.id === sourceId);
  return (
    <ServerForm action={action} pending={pending} className="grid gap-4" noValidate>
      <FormStatus state={state} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Nome do fornecedor" htmlFor="displayName" error={fieldError(state, "displayName")}>
          <Input id="displayName" name="displayName" required />
        </Field>
        <Field label="Tipo de integração" htmlFor="supplierSourceId" error={fieldError(state, "supplierSourceId")} hint={selected?.description ?? undefined}>
          <input type="hidden" name="supplierSourceId" value={sourceId} />
          <Select value={sourceId} onValueChange={setSourceId}>
            <SelectTrigger id="supplierSourceId" className="w-full">
              <SelectValue placeholder="Selecione" />
            </SelectTrigger>
            <SelectContent>
              {sources.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.name}
                  {s.status !== "available" ? " (não configurado)" : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Contato" htmlFor="contactName">
          <Input id="contactName" name="contactName" />
        </Field>
        <Field label="E-mail do contato" htmlFor="contactEmail" error={fieldError(state, "contactEmail")}>
          <Input id="contactEmail" name="contactEmail" type="email" />
        </Field>
        <Field label="Telefone" htmlFor="contactPhone">
          <Input id="contactPhone" name="contactPhone" />
        </Field>
        <Field label="Site" htmlFor="website" error={fieldError(state, "website")}>
          <Input id="website" name="website" placeholder="https://" />
        </Field>
      </div>
      <Field label="Observações (condições comerciais, pedido mínimo, forma de envio de pedidos)" htmlFor="notes">
        <Textarea id="notes" name="notes" rows={3} />
      </Field>
      <div className="flex items-start gap-2">
        <Checkbox id="dropshipAgreementConfirmed" name="dropshipAgreementConfirmed" />
        <Label htmlFor="dropshipAgreementConfirmed" className="font-normal leading-snug">
          Confirmo que existe acordo com este fornecedor para revenda e despacho direto ao comprador.
        </Label>
      </div>
      <div>
        <SubmitButton>Cadastrar fornecedor</SubmitButton>
      </div>
    </ServerForm>
  );
}

export function SupplierStatusButton({ connectionId, status }: { connectionId: string; status: string }) {
  const next = status === "disabled" ? "active" : "disabled";
  return (
    <ActionForm
      action={setSupplierConnectionStatusAction}
      confirm={
        next === "disabled"
          ? { title: "Desativar fornecedor?", description: "Novas importações e cadastros para este fornecedor serão bloqueados. As ofertas existentes são mantidas." }
          : undefined
      }
    >
      <input type="hidden" name="connectionId" value={connectionId} />
      <input type="hidden" name="status" value={next} />
      <Button type="submit" variant="outline" size="sm">
        {next === "disabled" ? "Desativar" : "Ativar"}
      </Button>
    </ActionForm>
  );
}
