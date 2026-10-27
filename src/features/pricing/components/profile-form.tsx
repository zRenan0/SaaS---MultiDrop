"use client";

import { useActionState } from "react";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Field } from "@/components/forms/field";
import { FormStatus, fieldError } from "@/components/forms/form-status";
import { SubmitButton } from "@/components/forms/submit-button";
import { ServerForm } from "@/components/forms/server-form";
import { savePricingProfileAction } from "@/features/pricing/actions";
import type { PricingRules } from "@/features/pricing/engine";

const pct = (v: string | null | undefined) => (v === null || v === undefined ? "" : String(Number(v) * 100).replace(".", ","));
const brl = (v: string | null | undefined) => (v === null || v === undefined ? "" : v.replace(".", ","));

export function PricingProfileForm({ profile }: { profile?: { id: string; name: string; isDefault: boolean; rules: PricingRules } }) {
  const [state, action, pending] = useActionState(savePricingProfileAction, null);
  const r = profile?.rules;
  const fixedThreshold = r?.fixedFeeBands.find((b) => b.upToPrice !== null);
  const fixedAbove = r?.fixedFeeBands.find((b) => b.upToPrice === null);
  const shipThreshold = r?.shippingBands.find((b) => b.upToPrice !== null);
  const shipAbove = r?.shippingBands.find((b) => b.upToPrice === null);
  const id = (k: string) => `${profile?.id ?? "new"}-${k}`;
  const f = (name: string, label: string, opts: { def?: string; hint?: string; placeholder?: string } = {}) => (
    <Field label={label} htmlFor={id(name)} error={fieldError(state, name)} hint={opts.hint}>
      <Input id={id(name)} name={name} defaultValue={opts.def ?? ""} placeholder={opts.placeholder} inputMode="decimal" />
    </Field>
  );
  return (
    <ServerForm action={action} pending={pending} className="grid gap-5" noValidate>
      <FormStatus state={state} />
      <input type="hidden" name="profileId" value={profile?.id ?? ""} />
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Nome do perfil" htmlFor={id("name")} error={fieldError(state, "name")}>
          <Input id={id("name")} name="name" defaultValue={profile?.name ?? ""} required />
        </Field>
        <Field label="Tipo de anúncio" htmlFor={id("listingType")} error={fieldError(state, "listingType")} hint="Identificador do Mercado Livre, ex.: gold_special (Clássico) ou gold_pro (Premium).">
          <Input id={id("listingType")} name="listingType" defaultValue={r?.listingType ?? "gold_special"} />
        </Field>
        {f("targetMargin", "Margem líquida desejada (%)", { def: pct(r?.targetMargin) })}
      </div>

      <fieldset className="grid gap-4 rounded-lg border p-4">
        <legend className="px-1 text-sm font-medium">Tarifas do marketplace (estimativa configurável)</legend>
        <p className="text-xs text-muted-foreground">
          Informe os valores conforme a tabela vigente do Mercado Livre para sua categoria e tipo de anúncio. Quando a conta estiver conectada,
          a calculadora poderá usar a tarifa oficial retornada pela API. Não usamos valores padrão inventados.
        </p>
        <div className="grid gap-4 sm:grid-cols-4">
          {f("variableFeeRate", "Tarifa de venda (%)", { def: pct(r?.variableFeeRate) })}
          {f("fixedFeeThreshold", "Custo fixo se preço abaixo de (R$)", { def: brl(fixedThreshold?.upToPrice), hint: "Deixe vazio se não houver faixa." })}
          {f("fixedFeeBelow", "Custo fixo abaixo do limite (R$)", { def: brl(fixedThreshold?.amount) })}
          {f("fixedFeeAbove", "Custo fixo a partir do limite (R$)", { def: brl(fixedAbove?.amount) })}
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          {f("shippingThreshold", "Frete do vendedor muda a partir de (R$)", { def: brl(shipThreshold?.upToPrice), hint: "Ex.: preço a partir do qual o frete grátis é obrigatório." })}
          {f("shippingBelow", "Frete pago abaixo do limite (R$)", { def: brl(shipThreshold?.amount) })}
          {f("shippingAbove", "Frete pago a partir do limite (R$)", { def: brl(shipAbove?.amount), hint: "Informe 0 se o vendedor não paga frete." })}
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Fonte das tarifas" htmlFor={id("feeReference")} hint="Ex.: página de custos do Mercado Livre, categoria X.">
            <Input id={id("feeReference")} name="feeReference" defaultValue={r?.feeReference ?? ""} />
          </Field>
          <Field label="Data da consulta" htmlFor={id("feeReferenceDate")} error={fieldError(state, "feeReferenceDate")}>
            <Input id={id("feeReferenceDate")} name="feeReferenceDate" type="date" defaultValue={r?.feeReferenceDate?.slice(0, 10) ?? ""} />
          </Field>
        </div>
      </fieldset>

      <fieldset className="grid gap-4 rounded-lg border p-4">
        <legend className="px-1 text-sm font-medium">Tributos, reservas e custos adicionais</legend>
        <p className="text-xs text-muted-foreground">
          A alíquota é uma estimativa para simulação, não apuração fiscal. Confirme o enquadramento tributário com seu contador.
        </p>
        <div className="grid gap-4 sm:grid-cols-3">
          {f("taxRate", "Tributos estimados sobre a venda (%)", { def: pct(r?.taxRate) })}
          {f("reserveRate", "Reserva para devoluções e perdas (%)", { def: pct(r?.reserveRate ?? "0") })}
          {f("operationalCostPerUnit", "Custo operacional por unidade (R$)", { def: brl(r?.operationalCostPerUnit ?? "0.00") })}
        </div>
        <div className="grid gap-4 sm:grid-cols-4">
          <Field label="Custo extra 1 (descrição)" htmlFor={id("extraCost1Label")}>
            <Input id={id("extraCost1Label")} name="extraCost1Label" defaultValue={r?.extraCostsPerUnit[0]?.label ?? ""} placeholder="Embalagem" />
          </Field>
          {f("extraCost1Amount", "Valor (R$)", { def: brl(r?.extraCostsPerUnit[0]?.amount) })}
          <Field label="Custo extra 2 (descrição)" htmlFor={id("extraCost2Label")}>
            <Input id={id("extraCost2Label")} name="extraCost2Label" defaultValue={r?.extraCostsPerUnit[1]?.label ?? ""} />
          </Field>
          {f("extraCost2Amount", "Valor (R$)", { def: brl(r?.extraCostsPerUnit[1]?.amount) })}
          <Field label="Percentual extra (descrição)" htmlFor={id("extraRate1Label")}>
            <Input id={id("extraRate1Label")} name="extraRate1Label" defaultValue={r?.extraRates[0]?.label ?? ""} placeholder="Antecipação de recebíveis" />
          </Field>
          {f("extraRate1Rate", "Percentual sobre a venda (%)", { def: pct(r?.extraRates[0]?.rate) })}
        </div>
      </fieldset>

      <div className="flex items-center gap-2">
        <Checkbox id={id("isDefault")} name="isDefault" defaultChecked={profile?.isDefault ?? !profile} />
        <Label htmlFor={id("isDefault")} className="font-normal">Usar como perfil padrão</Label>
      </div>
      <div>
        <SubmitButton>{profile ? "Salvar nova versão" : "Criar perfil"}</SubmitButton>
      </div>
    </ServerForm>
  );
}
