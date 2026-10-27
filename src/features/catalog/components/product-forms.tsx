"use client";

import { useActionState, useState } from "react";
import { Pencil } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Field } from "@/components/forms/field";
import { FormStatus, fieldError } from "@/components/forms/form-status";
import { SubmitButton } from "@/components/forms/submit-button";
import { ServerForm } from "@/components/forms/server-form";
import { ActionForm } from "@/components/forms/action-form";
import { addOfferAction, createProductAction, deleteProductAction, updateOfferAction } from "@/features/catalog/actions";
import type { ActionResult } from "@/server/errors";

type Connection = { id: string; display_name: string };

function SupplierSelect({ connections, state }: { connections: Connection[]; state: ActionResult | null }) {
  return (
    <Field label="Fornecedor" htmlFor="supplierConnectionId" error={fieldError(state, "supplierConnectionId")}>
      <select id="supplierConnectionId" name="supplierConnectionId" required className="h-8 rounded-lg border bg-background px-2 text-sm" defaultValue="">
        <option value="" disabled>Selecione</option>
        {connections.map((c) => (
          <option key={c.id} value={c.id}>{c.display_name}</option>
        ))}
      </select>
    </Field>
  );
}

function OfferFields({ state, defaults, idPrefix = "" }: { state: ActionResult | null; defaults?: Record<string, string | number | null>; idPrefix?: string }) {
  const d = (k: string) => (defaults?.[k] ?? "") as string;
  return (
    <div className="grid gap-4 sm:grid-cols-3">
      <Field label="Custo de aquisição (R$)" htmlFor={`${idPrefix}cost`} error={fieldError(state, "cost")}>
        <Input id={`${idPrefix}cost`} name="cost" inputMode="decimal" defaultValue={d("cost")} required />
      </Field>
      <Field label="Frete de entrada (R$)" htmlFor={`${idPrefix}inboundShippingCost`} error={fieldError(state, "inboundShippingCost")} hint="Quando o fornecedor cobra o envio até você ou até o comprador.">
        <Input id={`${idPrefix}inboundShippingCost`} name="inboundShippingCost" inputMode="decimal" defaultValue={d("inboundShippingCost")} />
      </Field>
      <Field label="Taxa de preparação/despacho (R$)" htmlFor={`${idPrefix}handlingFee`} error={fieldError(state, "handlingFee")}>
        <Input id={`${idPrefix}handlingFee`} name="handlingFee" inputMode="decimal" defaultValue={d("handlingFee")} />
      </Field>
      <Field label="Estoque disponível" htmlFor={`${idPrefix}stock`} error={fieldError(state, "stock")}>
        <Input id={`${idPrefix}stock`} name="stock" inputMode="numeric" defaultValue={d("stock")} required />
      </Field>
      <Field label="Prazo de despacho (dias)" htmlFor={`${idPrefix}handlingTimeDays`} error={fieldError(state, "handlingTimeDays")}>
        <Input id={`${idPrefix}handlingTimeDays`} name="handlingTimeDays" inputMode="numeric" defaultValue={d("handlingTimeDays")} />
      </Field>
    </div>
  );
}

export function NewProductForm({ connections }: { connections: Connection[] }) {
  const [state, action, pending] = useActionState(createProductAction, null);
  return (
    <ServerForm action={action} pending={pending} className="grid gap-6" noValidate>
      <FormStatus state={state} />
      <section className="grid gap-4">
        <h2 className="font-medium">Produto</h2>
        <Field label="Título" htmlFor="title" error={fieldError(state, "title")}>
          <Input id="title" name="title" required maxLength={255} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Marca" htmlFor="brand" error={fieldError(state, "brand")}>
            <Input id="brand" name="brand" />
          </Field>
          <Field label="Modelo" htmlFor="model" error={fieldError(state, "model")}>
            <Input id="model" name="model" />
          </Field>
          <Field label="GTIN/EAN" htmlFor="gtin" error={fieldError(state, "gtin")}>
            <Input id="gtin" name="gtin" inputMode="numeric" />
          </Field>
        </div>
        <Field label="Categoria (texto livre)" htmlFor="category" error={fieldError(state, "category")}>
          <Input id="category" name="category" />
        </Field>
        <Field label="Descrição" htmlFor="description" error={fieldError(state, "description")}>
          <Textarea id="description" name="description" rows={4} />
        </Field>
        <Field label="URLs das imagens (uma por linha)" htmlFor="imageUrls" error={fieldError(state, "imageUrls")} hint="Somente https. Use apenas imagens que você tem autorização para usar.">
          <Textarea id="imageUrls" name="imageUrls" rows={3} />
        </Field>
        <div className="flex items-start gap-2">
          <Checkbox id="imagesAuthorized" name="imagesAuthorized" />
          <Label htmlFor="imagesAuthorized" className="font-normal">Tenho autorização para usar estas imagens em anúncios.</Label>
        </div>
      </section>
      <section className="grid gap-4">
        <h2 className="font-medium">Oferta do fornecedor</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          <SupplierSelect connections={connections} state={state} />
          <Field label="SKU no fornecedor" htmlFor="sku" error={fieldError(state, "sku")}>
            <Input id="sku" name="sku" required />
          </Field>
          <Field label="ID da oferta no fornecedor" htmlFor="externalOfferId" error={fieldError(state, "externalOfferId")}>
            <Input id="externalOfferId" name="externalOfferId" />
          </Field>
        </div>
        <OfferFields state={state} />
      </section>
      <div>
        <SubmitButton>Salvar produto</SubmitButton>
      </div>
    </ServerForm>
  );
}

export function AddOfferForm({ productId, connections }: { productId: string; connections: Connection[] }) {
  const [state, action, pending] = useActionState(addOfferAction, null);
  return (
    <ServerForm action={action} pending={pending} className="grid gap-4" noValidate>
      <FormStatus state={state} />
      <input type="hidden" name="productId" value={productId} />
      <div className="grid gap-4 sm:grid-cols-3">
        <SupplierSelect connections={connections} state={state} />
        <Field label="SKU no fornecedor" htmlFor="sku" error={fieldError(state, "sku")}>
          <Input id="sku" name="sku" required />
        </Field>
        <Field label="ID da oferta no fornecedor" htmlFor="externalOfferId">
          <Input id="externalOfferId" name="externalOfferId" />
        </Field>
      </div>
      <OfferFields state={state} />
      <div>
        <SubmitButton>Adicionar oferta</SubmitButton>
      </div>
    </ServerForm>
  );
}

type Offer = {
  id: string;
  version: number;
  supplier_cost: number;
  inbound_shipping_cost: number;
  supplier_handling_fee: number;
  available_stock: number;
  handling_time_days: number | null;
  status: string;
};

export function EditOfferDialog({ offer }: { offer: Offer }) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(async (prev: ActionResult | null, formData: FormData) => {
    const result = await updateOfferAction(prev, formData);
    if (result.ok) setOpen(false);
    return result;
  }, null);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" aria-label="Editar oferta">
          <Pencil aria-hidden /> Editar
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Editar oferta</DialogTitle>
          <DialogDescription>Atualizar o custo registra a data da alteração usada na calculadora.</DialogDescription>
        </DialogHeader>
        <ServerForm action={action} pending={pending} className="grid gap-4" noValidate>
          <FormStatus state={state} />
          <input type="hidden" name="offerId" value={offer.id} />
          <input type="hidden" name="version" value={offer.version} />
          <OfferFields
            state={state}
            idPrefix={`edit-${offer.id}-`}
            defaults={{
              cost: String(offer.supplier_cost),
              inboundShippingCost: String(offer.inbound_shipping_cost),
              handlingFee: String(offer.supplier_handling_fee),
              stock: offer.available_stock,
              handlingTimeDays: offer.handling_time_days,
            }}
          />
          <Field label="Status" htmlFor="status">
            <select id="status" name="status" defaultValue={offer.status} className="h-8 rounded-lg border bg-background px-2 text-sm">
              <option value="active">Ativa</option>
              <option value="paused">Pausada</option>
              <option value="out_of_stock">Sem estoque</option>
              <option value="discontinued">Descontinuada</option>
            </select>
          </Field>
          <div>
            <SubmitButton>Salvar</SubmitButton>
          </div>
        </ServerForm>
      </DialogContent>
    </Dialog>
  );
}

export function DeleteProductButton({ productId }: { productId: string }) {
  return (
    <ActionForm
      action={deleteProductAction}
      confirm={{
        title: "Excluir produto?",
        description: "O produto, suas ofertas, simulações e rascunhos de anúncio serão excluídos. Esta ação não pode ser desfeita.",
        confirmLabel: "Excluir",
      }}
    >
      <input type="hidden" name="productId" value={productId} />
      <Button type="submit" variant="destructive">Excluir produto</Button>
    </ActionForm>
  );
}
