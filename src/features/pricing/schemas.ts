import { z } from "zod";
import { parseBrlAmount, parsePercent } from "@/lib/money";
import type { Band, PricingRules } from "@/features/pricing/engine";

function parseFraction(v: string, label: string, max: number, ctx: z.RefinementCtx) {
  const fraction = parsePercent(v);
  if (!fraction || fraction.isNegative() || fraction.greaterThanOrEqualTo(max)) {
    ctx.addIssue({ code: "custom", message: `${label} deve estar entre 0% e ${max * 100}%.` });
    return z.NEVER;
  }
  return fraction.toDecimalPlaces(6).toString();
}

function parseMoney(v: string, label: string, ctx: z.RefinementCtx) {
  const amount = parseBrlAmount(v);
  if (!amount || amount.isNegative()) {
    ctx.addIssue({ code: "custom", message: `${label} inválido.` });
    return z.NEVER;
  }
  return amount.toDecimalPlaces(2).toFixed(2);
}

const percent = (label: string, max: number) =>
  z.string().optional().transform((v, ctx) => {
    if (v === undefined || v.trim() === "") {
      ctx.addIssue({ code: "custom", message: `Informe ${label}.` });
      return z.NEVER;
    }
    return parseFraction(v, label, max, ctx);
  });

const optionalPercent = (label: string, max: number) =>
  z.string().optional().transform((v, ctx): string | null => (v === undefined || v.trim() === "" ? null : parseFraction(v, label, max, ctx)));

const money = (label: string) =>
  z.string().optional().transform((v, ctx) => {
    if (v === undefined || v.trim() === "") {
      ctx.addIssue({ code: "custom", message: `Informe ${label}.` });
      return z.NEVER;
    }
    return parseMoney(v, label, ctx);
  });

const optionalMoney = (label: string) =>
  z.string().optional().transform((v, ctx): string | null => (v === undefined || v.trim() === "" ? null : parseMoney(v, label, ctx)));

const label = z.string().trim().max(60).optional();

export const pricingProfileSchema = z
  .object({
    profileId: z.uuid().optional().or(z.literal("").transform(() => undefined)),
    name: z.string().trim().min(2, "Informe o nome do perfil.").max(80),
    isDefault: z.string().optional().transform((v) => v === "on" || v === "true"),
    listingType: z.string().trim().min(2).max(40).regex(/^[a-z_]+$/, "Use o identificador do tipo de anúncio (ex.: gold_special)."),
    targetMargin: percent("a margem desejada", 0.9),
    variableFeeRate: optionalPercent("a tarifa de venda", 1),
    fixedFeeThreshold: optionalMoney("o limite de preço do custo fixo"),
    fixedFeeBelow: optionalMoney("o custo fixo abaixo do limite"),
    fixedFeeAbove: optionalMoney("o custo fixo acima do limite"),
    shippingThreshold: optionalMoney("o limite de preço do frete"),
    shippingBelow: optionalMoney("o frete abaixo do limite"),
    shippingAbove: optionalMoney("o frete acima do limite"),
    taxRate: optionalPercent("a alíquota de tributos", 0.6),
    reserveRate: percent("a reserva", 0.5),
    operationalCostPerUnit: money("o custo operacional"),
    extraCost1Label: label,
    extraCost1Amount: optionalMoney("o custo extra"),
    extraCost2Label: label,
    extraCost2Amount: optionalMoney("o custo extra"),
    extraRate1Label: label,
    extraRate1Rate: optionalPercent("o percentual extra", 0.5),
    feeReference: z.string().trim().max(300).optional(),
    feeReferenceDate: z.iso.date("Data inválida.").optional().or(z.literal("").transform(() => undefined)),
  })
  .superRefine((v, ctx) => {
    if (v.fixedFeeThreshold && v.fixedFeeBelow === null) ctx.addIssue({ code: "custom", path: ["fixedFeeBelow"], message: "Informe o valor abaixo do limite." });
    if (v.shippingThreshold && v.shippingBelow === null) ctx.addIssue({ code: "custom", path: ["shippingBelow"], message: "Informe o frete abaixo do limite." });
  });

export type PricingProfileInput = z.infer<typeof pricingProfileSchema>;

function bands(threshold: string | null, below: string | null, above: string | null): Band[] {
  if (threshold) return [{ upToPrice: threshold, amount: below ?? "0" }, { upToPrice: null, amount: above ?? "0" }];
  if (above !== null) return [{ upToPrice: null, amount: above }];
  return [];
}

export function profileInputToRules(input: PricingProfileInput): PricingRules {
  return {
    listingType: input.listingType,
    variableFeeRate: input.variableFeeRate,
    fixedFeeBands: bands(input.fixedFeeThreshold, input.fixedFeeBelow, input.fixedFeeAbove),
    shippingBands: bands(input.shippingThreshold, input.shippingBelow, input.shippingAbove),
    taxRate: input.taxRate,
    reserveRate: input.reserveRate,
    extraRates: input.extraRate1Label && input.extraRate1Rate ? [{ label: input.extraRate1Label, rate: input.extraRate1Rate }] : [],
    extraCostsPerUnit: [
      ...(input.extraCost1Label && input.extraCost1Amount ? [{ label: input.extraCost1Label, amount: input.extraCost1Amount }] : []),
      ...(input.extraCost2Label && input.extraCost2Amount ? [{ label: input.extraCost2Label, amount: input.extraCost2Amount }] : []),
    ],
    operationalCostPerUnit: input.operationalCostPerUnit,
    targetMargin: input.targetMargin,
    feeOrigin: "manual",
    feeReference: input.feeReference || null,
    feeReferenceDate: input.feeReferenceDate ?? null,
  };
}

const bandSchema = z.object({ upToPrice: z.string().nullable(), amount: z.string() });
export const storedRulesSchema = z.object({
  listingType: z.string(),
  variableFeeRate: z.string().nullable(),
  fixedFeeBands: z.array(bandSchema),
  shippingBands: z.array(bandSchema),
  taxRate: z.string().nullable(),
  reserveRate: z.string(),
  extraRates: z.array(z.object({ label: z.string(), rate: z.string() })),
  extraCostsPerUnit: z.array(z.object({ label: z.string(), amount: z.string() })),
  operationalCostPerUnit: z.string(),
  targetMargin: z.string(),
  feeOrigin: z.enum(["official", "manual", "missing"]),
  feeReference: z.string().nullable(),
  feeReferenceDate: z.string().nullable(),
});

export const scenarioQuerySchema = z.object({
  product: z.uuid().optional(),
  profile: z.uuid().optional(),
  offer: z.uuid().optional(),
  p1: z.string().optional(),
  p2: z.string().optional(),
  p3: z.string().optional(),
});
