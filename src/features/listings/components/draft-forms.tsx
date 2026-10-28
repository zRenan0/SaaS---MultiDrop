"use client";

import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { Loader2, Search } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Field } from "@/components/forms/field";
import { FormStatus, fieldError } from "@/components/forms/form-status";
import { SubmitButton } from "@/components/forms/submit-button";
import { ServerForm } from "@/components/forms/server-form";
import { ActionForm } from "@/components/forms/action-form";
import {
  createDraftAction,
  deleteDraftAction,
  fetchOfficialFeeAction,
  predictCategoryAction,
  publishDraftAction,
  refreshListingAction,
  retryDraftAction,
  updateDraftAction,
  validateDraftAction,
} from "@/features/listings/actions";
import type { DraftAttribute } from "@/features/listings/payload";

type Option = { id: string; label: string };

const DEFAULT_LISTING_TYPES: Option[] = [
  { id: "gold_special", label: "Clássico" },
  { id: "gold_pro", label: "Premium" },
];

export function NewDraftForm({ productId, offers, accounts }: { productId: string; offers: Option[]; accounts: Option[] }) {
  const [state, action, pending] = useActionState(createDraftAction, null);
  return (
    <ServerForm action={action} pending={pending} className="grid gap-4" noValidate>
      <FormStatus state={state} />
      <input type="hidden" name="productId" value={productId} />
      <Field label="Oferta que atenderá o anúncio" htmlFor="offerId" error={fieldError(state, "offerId")}>
        <select id="offerId" name="offerId" defaultValue={offers[0]?.id ?? ""} className="h-8 rounded-lg border bg-background px-2 text-sm">
          {offers.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
        </select>
      </Field>
      <Field label="Conta do Mercado Livre" htmlFor="accountId" hint={accounts.length === 0 ? "Nenhuma conta conectada. Você pode preparar o rascunho e conectar depois." : undefined}>
        <select id="accountId" name="accountId" defaultValue={accounts[0]?.id ?? ""} className="h-8 rounded-lg border bg-background px-2 text-sm">
          <option value="">Definir depois</option>
          {accounts.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
        </select>
      </Field>
      <div>
        <SubmitButton pendingText="Criando…">Criar rascunho</SubmitButton>
      </div>
    </ServerForm>
  );
}

export type CategoryAttributeField = { id: string; name: string; required: boolean; values: { id: string; name: string }[]; hint?: string };

type DraftValues = {
  id: string;
  accountId: string | null;
  title: string | null;
  familyName: string | null;
  categoryId: string | null;
  listingTypeId: string | null;
  condition: string;
  price: string | null;
  stock: number | null;
  description: string | null;
  attributes: DraftAttribute[];
};

export function DraftEditor({
  draft,
  accounts,
  listingTypes,
  attributeFields,
  userProductSeller,
  locked,
}: {
  draft: DraftValues;
  accounts: Option[];
  listingTypes: Option[];
  attributeFields: CategoryAttributeField[];
  userProductSeller: boolean | null;
  locked: boolean;
}) {
  const [state, action, pending] = useActionState(updateDraftAction, null);
  // Salvamento automático ao escolher categoria: leva aos atributos. Salvamento manual: leva à validação.
  const autoSave = useRef(false);
  useEffect(() => {
    if (!state?.ok) return;
    const target = autoSave.current ? "atributos" : "validacao";
    autoSave.current = false;
    document.getElementById(target)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [state]);
  const formRef = useRef<HTMLFormElement>(null);
  const [categoryId, setCategoryId] = useState(draft.categoryId ?? "");
  // Sem categoria a API não informa os tipos disponíveis para a conta; mostra os tipos padrão do Brasil.
  const typeOptions = listingTypes.length ? listingTypes : DEFAULT_LISTING_TYPES;
  const typeList = draft.listingTypeId && !typeOptions.some((t) => t.id === draft.listingTypeId) ? [...typeOptions, { id: draft.listingTypeId, label: draft.listingTypeId }] : typeOptions;
  const [suggestions, setSuggestions] = useState<{ id: string; name: string }[]>([]);
  const [predicting, startPredict] = useTransition();
  const valueOf = (id: string) => draft.attributes.find((a) => a.id === id);
  const extraAttributes = draft.attributes.filter((a) => !attributeFields.some((f) => f.id === a.id));

  return (
    <ServerForm ref={formRef} action={action} pending={pending} className="grid gap-5" noValidate>
      <FormStatus state={state} />
      <input type="hidden" name="draftId" value={draft.id} />
      <fieldset disabled={locked} className="grid gap-5">
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Conta do Mercado Livre" htmlFor="accountId">
            <select id="accountId" name="accountId" defaultValue={draft.accountId ?? ""} className="h-8 rounded-lg border bg-background px-2 text-sm">
              <option value="">Selecione</option>
              {accounts.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
            </select>
          </Field>
          <Field
            label="Tipo de anúncio"
            htmlFor="listingTypeId"
            error={fieldError(state, "listingTypeId")}
            hint={listingTypes.length ? "Tipos liberados para esta conta e categoria." : "Clássico: tarifa menor. Premium: parcelamento sem juros e tarifa maior."}
          >
            <select id="listingTypeId" name="listingTypeId" defaultValue={draft.listingTypeId ?? "gold_special"} className="h-8 rounded-lg border bg-background px-2 text-sm">
              {typeList.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
            </select>
          </Field>
          <Field label="Condição" htmlFor="condition">
            <select id="condition" name="condition" defaultValue={draft.condition} className="h-8 rounded-lg border bg-background px-2 text-sm">
              <option value="new">Novo</option>
              <option value="used">Usado</option>
              <option value="not_specified">Não especificado</option>
            </select>
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label={userProductSeller ? "Título (não enviado: gerado pelo Mercado Livre)" : "Título do anúncio"}
            htmlFor="title"
            error={fieldError(state, "title")}
            hint="Máximo de 60 caracteres."
          >
            <Input id="title" name="title" defaultValue={draft.title ?? ""} maxLength={60} />
          </Field>
          <Field
            label={userProductSeller === false ? "Nome da família (usado só no modelo User Products)" : "Nome da família (family_name)"}
            htmlFor="familyName"
            error={fieldError(state, "familyName")}
            hint="Nome genérico do produto, sem variações. Obrigatório no modelo User Products."
          >
            <Input id="familyName" name="familyName" defaultValue={draft.familyName ?? ""} maxLength={60} />
          </Field>
        </div>

        <div className="grid gap-2">
          <Label htmlFor="categoryId">Categoria</Label>
          <div className="flex flex-wrap gap-2">
            <Input id="categoryId" name="categoryId" value={categoryId} onChange={(e) => setCategoryId(e.target.value)} placeholder="MLB1234" className="w-40" />
            <Button
              type="button"
              variant="outline"
              disabled={predicting || locked}
              onClick={() =>
                startPredict(async () => {
                  const result = await predictCategoryAction(draft.id, draft.familyName || draft.title || "");
                  if (!result.ok) toast.error(result.error);
                  else setSuggestions(result.data ?? []);
                })
              }
            >
              {predicting ? <Loader2 className="animate-spin" aria-hidden /> : <Search aria-hidden />} Sugerir pelo título
            </Button>
          </div>
          {suggestions.length > 0 ? (
            <ul className="grid gap-1" aria-label="Categorias sugeridas">
              {suggestions.map((s) => (
                <li key={s.id}>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setCategoryId(s.id);
                      setSuggestions([]);
                      // Salva na hora para carregar atributos e tipos de anúncio da categoria escolhida.
                      autoSave.current = true;
                      setTimeout(() => formRef.current?.requestSubmit(), 0);
                    }}
                  >
                    {s.id} · {s.name}
                  </Button>
                </li>
              ))}
            </ul>
          ) : null}
          <p className="text-xs text-muted-foreground">Clique em Sugerir pelo título e escolha uma opção: o rascunho é salvo e os campos exigidos pela categoria aparecem logo abaixo.</p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Preço de venda (R$)" htmlFor="price" error={fieldError(state, "price")}>
            <Input id="price" name="price" inputMode="decimal" defaultValue={draft.price?.replace(".", ",") ?? ""} />
          </Field>
          <Field label="Estoque a anunciar" htmlFor="stock" error={fieldError(state, "stock")} hint="Não pode exceder o estoque informado pelo fornecedor.">
            <Input id="stock" name="stock" inputMode="numeric" defaultValue={draft.stock ?? ""} />
          </Field>
        </div>

        {attributeFields.length > 0 ? (
          <fieldset id="atributos" className="grid scroll-mt-20 gap-3 rounded-lg border p-4">
            <legend className="px-1 text-sm font-medium">Atributos da categoria</legend>
            <div className="grid gap-3 sm:grid-cols-2">
              {attributeFields.map((f) => {
                const current = valueOf(f.id);
                return (
                  <Field key={f.id} label={`${f.name}${f.required ? " *" : ""}`} htmlFor={`attr-${f.id}`} hint={f.hint}>
                    <input type="hidden" name={`attrname__${f.id}`} value={f.name} />
                    {f.values.length > 0 ? (
                      <select id={`attr-${f.id}`} name={`attrv__${f.id}`} defaultValue={current?.value_id ?? ""} className="h-8 rounded-lg border bg-background px-2 text-sm">
                        <option value="">Selecione</option>
                        {f.values.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
                      </select>
                    ) : (
                      <Input id={`attr-${f.id}`} name={`attr__${f.id}`} defaultValue={current?.value_name ?? ""} />
                    )}
                  </Field>
                );
              })}
            </div>
          </fieldset>
        ) : null}
        {extraAttributes.map((a) => (
          <span key={a.id}>
            <input type="hidden" name={a.value_id ? `attrv__${a.id}` : `attr__${a.id}`} value={a.value_id ?? a.value_name ?? ""} />
            <input type="hidden" name={`attrname__${a.id}`} value={a.name ?? a.id} />
          </span>
        ))}

        <Field label="Descrição (texto simples)" htmlFor="description">
          <Textarea id="description" name="description" rows={6} defaultValue={draft.description ?? ""} />
        </Field>
      </fieldset>
      {locked ? null : (
        <div>
          <SubmitButton>Salvar rascunho</SubmitButton>
        </div>
      )}
    </ServerForm>
  );
}

export function DraftActions({ draftId, status, canPublish }: { draftId: string; status: string; canPublish: boolean }) {
  const [confirmText, setConfirmText] = useState("");
  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap gap-2">
        {status === "draft" || status === "invalid" || status === "validated" ? (
          <ActionForm action={validateDraftAction}>
            <input type="hidden" name="draftId" value={draftId} />
            <Button type="submit" variant="outline">Validar no Mercado Livre</Button>
          </ActionForm>
        ) : null}
        <ActionForm action={fetchOfficialFeeAction}>
          <input type="hidden" name="draftId" value={draftId} />
          <Button type="submit" variant="outline">Consultar tarifa oficial</Button>
        </ActionForm>
        {status === "failed" && canPublish ? (
          <ActionForm action={retryDraftAction}>
            <input type="hidden" name="draftId" value={draftId} />
            <Button type="submit" variant="outline">Voltar para edição</Button>
          </ActionForm>
        ) : null}
        {status !== "published" && status !== "publishing" ? (
          <ActionForm action={deleteDraftAction} confirm={{ title: "Excluir rascunho?", description: "O rascunho será removido. Nada é alterado no Mercado Livre." }}>
            <input type="hidden" name="draftId" value={draftId} />
            <Button type="submit" variant="ghost">Excluir rascunho</Button>
          </ActionForm>
        ) : null}
      </div>
      {status === "validated" && canPublish ? (
        <ActionForm
          action={publishDraftAction}
          className="grid max-w-md gap-2 rounded-lg border border-primary/40 p-4"
          confirm={{
            title: "Publicar no Mercado Livre?",
            description: "Será criado um anúncio REAL na conta selecionada, visível a compradores. Confirme que o fornecedor tem estoque e aceita o despacho.",
            confirmLabel: "Publicar agora",
          }}
        >
          <input type="hidden" name="draftId" value={draftId} />
          <Label htmlFor="confirm">Para publicar, digite PUBLICAR</Label>
          <Input id="confirm" name="confirm" value={confirmText} onChange={(e) => setConfirmText(e.target.value)} autoComplete="off" />
          <Button type="submit" disabled={confirmText !== "PUBLICAR"}>Publicar anúncio</Button>
        </ActionForm>
      ) : null}
      {status === "validated" && !canPublish ? <p className="text-sm text-muted-foreground">Validado. Um administrador precisa publicar.</p> : null}
    </div>
  );
}

export function RefreshListingButton({ listingId }: { listingId: string }) {
  return (
    <ActionForm action={refreshListingAction}>
      <input type="hidden" name="listingId" value={listingId} />
      <Button type="submit" variant="ghost" size="sm">Consultar status</Button>
    </ActionForm>
  );
}
