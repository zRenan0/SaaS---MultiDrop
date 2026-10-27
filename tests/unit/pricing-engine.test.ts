import { describe, expect, it } from "vitest";
import { calculate, evaluatePrice, solvePrice, type CostInput, type PricingRules } from "@/features/pricing/engine";

const now = new Date().toISOString();

const rules = (over: Partial<PricingRules> = {}): PricingRules => ({
  listingType: "gold_special",
  variableFeeRate: "0.12",
  fixedFeeBands: [
    { upToPrice: "79.00", amount: "6.00" },
    { upToPrice: null, amount: "0" },
  ],
  shippingBands: [
    { upToPrice: "79.00", amount: "0" },
    { upToPrice: null, amount: "20.00" },
  ],
  taxRate: "0.06",
  reserveRate: "0.02",
  extraRates: [],
  extraCostsPerUnit: [{ label: "Embalagem", amount: "2.00" }],
  operationalCostPerUnit: "1.00",
  targetMargin: "0.15",
  feeOrigin: "manual",
  feeReference: "Teste",
  feeReferenceDate: now,
  ...over,
});

const cost: CostInput = { supplierCost: "50.00", inboundShippingCost: "5.00", supplierHandlingFee: "3.00", costUpdatedAt: now };

describe("motor de preço: valores conferidos manualmente", () => {
  it("avalia um preço com composição completa (P = 124,62)", () => {
    // Taxa 12% = 14,9544 → 14,95; tributos 6% = 7,4772 → 7,48; reserva 2% = 2,4924 → 2,49
    // Custos fixos 50+5+3+2+1 = 61; frete do vendedor 20 (faixa >= 79); custo fixo ML 0
    // Total 61 + 14,95 + 20 + 7,48 + 2,49 = 105,92 → lucro 18,70
    const ev = evaluatePrice(cost, rules(), "124.62");
    expect(ev.totalCosts).toBe("105.92");
    expect(ev.profit).toBe("18.70");
    expect(ev.margin).toBe("0.1501");
    expect(ev.markup).toBe("1.1486"); // 124,62 / 58 − 1
    expect(ev.fees).toBe("14.95");
    expect(ev.taxes).toBe("7.48");
    const byKey = Object.fromEntries(ev.lines.map((l) => [l.key, l.amount]));
    expect(byKey).toMatchObject({ sale_fee: "14.95", fixed_fee: "0.00", seller_shipping: "20.00", reserve: "2.49", extra_cost_0: "2.00" });
  });

  it("sugere o menor preço com margem alvo considerando faixas (custo fixo abaixo de 79, frete acima)", () => {
    // Faixa [0,79): 67 / 0,65 = 103,08 → fora da faixa. Faixa [79,∞): 81 / 0,65 = 124,6154 → 124,62
    expect(solvePrice(cost, rules(), "0.15")?.toFixed(2)).toBe("124.62");
  });

  it("calcula o preço mínimo sem prejuízo", () => {
    // 81 / 0,80 = 101,25 → arredondamentos dão lucro −0,01; 101,26 dá lucro 0,00
    const result = calculate(cost, rules());
    expect(result.status).toBe("complete");
    if (result.status !== "complete") return;
    expect(result.breakEvenPrice).toBe("101.26");
    expect(evaluatePrice(cost, rules(), "101.26").profit).toBe("0.00");
    expect(evaluatePrice(cost, rules(), "101.25").profit).toBe("-0.01");
    // Logo abaixo da faixa de frete há prejuízo (custo fixo 6 + taxas)
    expect(evaluatePrice(cost, rules(), "78.99").profit).toBe("-3.81");
  });

  it("garante margem >= alvo mesmo com arredondamento (100/0,7 = 142,857 → 142,87)", () => {
    const simple = rules({ fixedFeeBands: [], shippingBands: [{ upToPrice: null, amount: "0" }], taxRate: "0", reserveRate: "0", extraCostsPerUnit: [], operationalCostPerUnit: "0", variableFeeRate: "0.10", targetMargin: "0.20" });
    const c: CostInput = { supplierCost: "100", inboundShippingCost: "0", supplierHandlingFee: "0", costUpdatedAt: now };
    expect(evaluatePrice(c, simple, "142.86").profit).toBe("28.57"); // margem 19,998%: insuficiente
    expect(solvePrice(c, simple, "0.20")?.toFixed(2)).toBe("142.87");
  });

  it("quando o preço calculado fica abaixo do início da faixa, usa a faixa mais barata válida", () => {
    const r = rules({ fixedFeeBands: [{ upToPrice: "50", amount: "5" }, { upToPrice: null, amount: "0" }], shippingBands: [{ upToPrice: null, amount: "0" }], taxRate: "0", reserveRate: "0", extraCostsPerUnit: [], operationalCostPerUnit: "0", variableFeeRate: "0.10", targetMargin: "0.10" });
    const c: CostInput = { supplierCost: "10", inboundShippingCost: "0", supplierHandlingFee: "0", costUpdatedAt: now };
    // Faixa [0,50): 15/0,8 = 18,75 → arredondamento exige 18,76. Faixa [50,∞): candidato 12,5 → sobe para 50.
    expect(solvePrice(c, r, "0.10")?.toFixed(2)).toBe("18.76");
  });

  it("retorna nulo quando percentuais somam 100% ou mais", () => {
    expect(solvePrice(cost, rules({ variableFeeRate: "0.5", taxRate: "0.3", targetMargin: "0.2" }), "0.2")).toBeNull();
    const result = calculate(cost, rules({ variableFeeRate: "0.5", taxRate: "0.3", targetMargin: "0.2" }));
    expect(result.status === "complete" && result.suggestedPrice).toBeNull();
    expect(result.warnings.join(" ")).toMatch(/Não existe preço/);
  });

  it("não apresenta resultado quando faltam parâmetros", () => {
    const result = calculate(cost, rules({ variableFeeRate: null, taxRate: null, shippingBands: [] }));
    expect(result.status).toBe("incomplete");
    expect(result.missing).toEqual([
      "Tarifa de venda do marketplace (%)",
      "Alíquota estimada de tributos (%)",
      "Frete pago pelo vendedor (informe 0 se não houver)",
    ]);
    expect("suggestedPrice" in result).toBe(false);
  });

  it("sinaliza dados desatualizados e tarifas estimadas", () => {
    const old = new Date(Date.now() - 40 * 86400_000).toISOString();
    const result = calculate({ ...cost, costUpdatedAt: old }, rules({ feeReferenceDate: old }));
    expect(result.warnings).toEqual(
      expect.arrayContaining([
        "Custo do fornecedor atualizado há mais de 7 dias.",
        "Tarifas do marketplace informadas manualmente (estimativa configurável), não obtidas da API oficial.",
        "Referência das tarifas tem mais de 30 dias. Confira a tabela vigente.",
      ]),
    );
  });

  it("compara cenários de preço", () => {
    const result = calculate(cost, rules(), ["99.90", "129.90", "0"]);
    if (result.status !== "complete") throw new Error("esperado completo");
    expect(result.scenarios.map((s) => s.price)).toEqual(["99.90", "129.90"]);
    // 129,90: taxa 15,588→15,59; tributos 7,794→7,79; reserva 2,598→2,60; total 61+15,59+20+7,79+2,60 = 106,98
    expect(result.scenarios[1].profit).toBe("22.92");
    expect(Number(result.scenarios[0].profit)).toBeLessThan(0);
  });

  it("é determinístico", () => {
    const a = calculate(cost, rules(), ["150"]);
    const b = calculate(cost, rules(), ["150"]);
    expect(a).toEqual(b);
  });
});
