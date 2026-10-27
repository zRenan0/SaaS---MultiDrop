import { ceilCents, dec, toCents, type Dec } from "@/lib/money";

/**
 * Motor de formação de preço. Determinístico, sem IA, sem acesso a banco.
 *
 * Modelo (por unidade vendida, preço P):
 *   custos fixos  = custo do fornecedor + frete de entrada + taxa de preparação + custos extras + custo operacional
 *                 + custo fixo por venda do marketplace (faixa de P) + frete pago pelo vendedor (faixa de P)
 *   custos sobre P = P × (tarifa de venda + tributos + reserva + percentuais extras)
 *   lucro         = P − custos fixos − custos sobre P        (cada componente arredondado a centavos)
 *   margem        = lucro / P
 *   markup        = P / custo da mercadoria − 1               (custo da mercadoria = fornecedor + frete de entrada + preparação)
 *
 * Preço para margem alvo m numa faixa [início, fim) onde custos fixos F são constantes:
 *   P = F / (1 − r − m), aceito se dentro da faixa; se ficar abaixo do início, o início da faixa já atende.
 *   O menor preço válido entre as faixas é escolhido e arredondado PARA CIMA ao centavo.
 */
export const CALCULATION_VERSION = "2026-10-27.1";

export type Band = { upToPrice: string | null; amount: string };
export type LabeledAmount = { label: string; amount: string };
export type LabeledRate = { label: string; rate: string };
export type DataOrigin = "official" | "manual" | "missing";

export type PricingRules = {
  listingType: string;
  variableFeeRate: string | null;
  fixedFeeBands: Band[];
  shippingBands: Band[];
  taxRate: string | null;
  reserveRate: string;
  extraRates: LabeledRate[];
  extraCostsPerUnit: LabeledAmount[];
  operationalCostPerUnit: string;
  targetMargin: string;
  feeOrigin: DataOrigin;
  feeReference: string | null;
  feeReferenceDate: string | null;
};

export type CostInput = {
  supplierCost: string;
  inboundShippingCost: string;
  supplierHandlingFee: string;
  costUpdatedAt: string | null;
};

export type BreakdownLine = {
  key: string;
  label: string;
  amount: string;
  kind: "revenue" | "cost" | "rate_cost" | "result";
  rate?: string;
  estimated: boolean;
};

export type PriceEvaluation = {
  price: string;
  profit: string;
  margin: string | null;
  markup: string | null;
  totalCosts: string;
  fees: string;
  taxes: string;
  lines: BreakdownLine[];
};

export type PricingResult =
  | {
      status: "complete";
      calculationVersion: string;
      goodsCost: string;
      breakEvenPrice: string | null;
      suggestedPrice: string | null;
      atSuggested: PriceEvaluation | null;
      scenarios: PriceEvaluation[];
      hasEstimates: boolean;
      warnings: string[];
      missing: [];
    }
  | { status: "incomplete"; calculationVersion: string; missing: string[]; warnings: string[] };

const MAX_PRICE = dec("99999999.99");

function bandAmount(bands: Band[], price: Dec): Dec {
  const sorted = sortBands(bands);
  for (const band of sorted) {
    if (band.upToPrice === null || price.lessThan(band.upToPrice)) return dec(band.amount);
  }
  return dec(0);
}

function sortBands(bands: Band[]): Band[] {
  return [...bands].sort((a, b) => {
    if (a.upToPrice === null) return 1;
    if (b.upToPrice === null) return -1;
    return dec(a.upToPrice).comparedTo(b.upToPrice);
  });
}

export function validateRules(rules: PricingRules): string[] {
  const missing: string[] = [];
  if (rules.variableFeeRate === null) missing.push("Tarifa de venda do marketplace (%)");
  if (rules.taxRate === null) missing.push("Alíquota estimada de tributos (%)");
  if (rules.shippingBands.length === 0) missing.push("Frete pago pelo vendedor (informe 0 se não houver)");
  return missing;
}

function totalRate(rules: PricingRules): Dec {
  return dec(rules.variableFeeRate ?? 0)
    .plus(rules.taxRate ?? 0)
    .plus(rules.reserveRate)
    .plus(rules.extraRates.reduce((acc, r) => acc.plus(r.rate), dec(0)));
}

function baseFixedCosts(cost: CostInput, rules: PricingRules): Dec {
  return dec(cost.supplierCost)
    .plus(cost.inboundShippingCost)
    .plus(cost.supplierHandlingFee)
    .plus(rules.extraCostsPerUnit.reduce((acc, c) => acc.plus(c.amount), dec(0)))
    .plus(rules.operationalCostPerUnit);
}

export function evaluatePrice(cost: CostInput, rules: PricingRules, priceInput: string): PriceEvaluation {
  const price = toCents(priceInput);
  const feeEstimated = rules.feeOrigin !== "official";
  const lines: BreakdownLine[] = [{ key: "price", label: "Preço de venda", amount: price.toFixed(2), kind: "revenue", estimated: false }];
  const push = (key: string, label: string, value: Dec, kind: BreakdownLine["kind"], estimated: boolean, rate?: string) => {
    const amount = toCents(value);
    lines.push({ key, label, amount: amount.toFixed(2), kind, estimated, rate });
    return amount;
  };

  const costs: Dec[] = [];
  costs.push(push("supplier_cost", "Custo do fornecedor", dec(cost.supplierCost), "cost", false));
  costs.push(push("inbound_shipping", "Frete de entrada", dec(cost.inboundShippingCost), "cost", false));
  costs.push(push("handling_fee", "Preparação e despacho do fornecedor", dec(cost.supplierHandlingFee), "cost", false));
  for (const [i, extra] of rules.extraCostsPerUnit.entries()) costs.push(push(`extra_cost_${i}`, extra.label, dec(extra.amount), "cost", false));
  costs.push(push("operational", "Custo operacional por unidade", dec(rules.operationalCostPerUnit), "cost", true));

  const saleFee = push("sale_fee", `Tarifa de venda (${rules.listingType})`, price.times(rules.variableFeeRate ?? 0), "rate_cost", feeEstimated, rules.variableFeeRate ?? undefined);
  const fixedFee = push("fixed_fee", "Custo fixo por venda do marketplace", bandAmount(rules.fixedFeeBands, price), "cost", feeEstimated);
  const shipping = push("seller_shipping", "Frete pago pelo vendedor", bandAmount(rules.shippingBands, price), "cost", true);
  const taxes = push("taxes", "Tributos estimados", price.times(rules.taxRate ?? 0), "rate_cost", true, rules.taxRate ?? undefined);
  const reserve = push("reserve", "Reserva para devoluções e perdas", price.times(rules.reserveRate), "rate_cost", true, rules.reserveRate);
  const extraRateCosts = rules.extraRates.map((r, i) => push(`extra_rate_${i}`, r.label, price.times(r.rate), "rate_cost", true, r.rate));

  const totalCosts = [...costs, saleFee, fixedFee, shipping, taxes, reserve, ...extraRateCosts].reduce((a, b) => a.plus(b), dec(0));
  const profit = price.minus(totalCosts);
  lines.push({ key: "profit", label: "Lucro estimado por unidade", amount: profit.toFixed(2), kind: "result", estimated: true });

  const goodsCost = dec(cost.supplierCost).plus(cost.inboundShippingCost).plus(cost.supplierHandlingFee);
  return {
    price: price.toFixed(2),
    profit: profit.toFixed(2),
    margin: price.isZero() ? null : profit.div(price).toDecimalPlaces(4).toFixed(4),
    markup: goodsCost.isZero() ? null : price.div(goodsCost).minus(1).toDecimalPlaces(4).toFixed(4),
    totalCosts: totalCosts.toFixed(2),
    fees: saleFee.plus(fixedFee).toFixed(2),
    taxes: taxes.toFixed(2),
    lines,
  };
}

/** Menor preço (ao centavo) com margem >= alvo. Retorna null se impossível (percentuais somam 100% ou mais). */
export function solvePrice(cost: CostInput, rules: PricingRules, targetMargin: string): Dec | null {
  const r = totalRate(rules);
  const denominator = dec(1).minus(r).minus(targetMargin);
  if (denominator.lessThanOrEqualTo(0)) return null;

  const thresholds = new Set<string>(["0"]);
  for (const band of [...rules.fixedFeeBands, ...rules.shippingBands]) if (band.upToPrice !== null) thresholds.add(dec(band.upToPrice).toFixed(2));
  const starts = [...thresholds].map((t) => dec(t)).sort((a, b) => a.comparedTo(b));
  const base = baseFixedCosts(cost, rules);

  let best: Dec | null = null;
  starts.forEach((start, i) => {
    const end = starts[i + 1] ?? MAX_PRICE;
    const fixed = base.plus(bandAmount(rules.fixedFeeBands, start)).plus(bandAmount(rules.shippingBands, start));
    let candidate = fixed.div(denominator);
    if (candidate.lessThan(start)) candidate = start;
    candidate = ceilCents(candidate);
    if (candidate.lessThan(end) && candidate.greaterThan(0) && (best === null || candidate.lessThan(best))) best = candidate;
  });
  if (best === null) return null;

  // Ajuste final: o arredondamento de cada componente pode reduzir a margem em centavos; sobe até atender.
  let price: Dec = best;
  for (let i = 0; i < 100; i++) {
    const ev = evaluatePrice(cost, rules, price.toFixed(2));
    if (dec(ev.profit).greaterThanOrEqualTo(price.times(targetMargin).toDecimalPlaces(2, 0))) return price;
    price = price.plus("0.01");
  }
  return price;
}

export function calculate(cost: CostInput, rules: PricingRules, scenarioPrices: string[] = []): PricingResult {
  const missing = validateRules(rules);
  const warnings: string[] = [];
  if (!cost.costUpdatedAt) warnings.push("Data de atualização do custo desconhecida.");
  else if (Date.now() - new Date(cost.costUpdatedAt).getTime() > 7 * 86400_000) warnings.push("Custo do fornecedor atualizado há mais de 7 dias.");
  if (rules.feeOrigin !== "official") warnings.push("Tarifas do marketplace informadas manualmente (estimativa configurável), não obtidas da API oficial.");
  if (rules.feeReferenceDate && Date.now() - new Date(rules.feeReferenceDate).getTime() > 30 * 86400_000) {
    warnings.push("Referência das tarifas tem mais de 30 dias. Confira a tabela vigente.");
  }
  if (missing.length > 0) return { status: "incomplete", calculationVersion: CALCULATION_VERSION, missing, warnings };

  const breakEven = solvePrice(cost, rules, "0");
  const suggested = solvePrice(cost, rules, rules.targetMargin);
  if (!suggested) warnings.push("Não existe preço que atinja a margem alvo com os percentuais configurados.");
  const goodsCost = dec(cost.supplierCost).plus(cost.inboundShippingCost).plus(cost.supplierHandlingFee);
  return {
    status: "complete",
    calculationVersion: CALCULATION_VERSION,
    goodsCost: goodsCost.toFixed(2),
    breakEvenPrice: breakEven?.toFixed(2) ?? null,
    suggestedPrice: suggested?.toFixed(2) ?? null,
    atSuggested: suggested ? evaluatePrice(cost, rules, suggested.toFixed(2)) : null,
    scenarios: scenarioPrices.filter((p) => dec(p).greaterThan(0)).map((p) => evaluatePrice(cost, rules, p)),
    hasEstimates: true,
    warnings,
    missing: [],
  };
}
