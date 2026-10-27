import Decimal from "decimal.js";

/**
 * Aritmética monetária exata.
 * Regras de arredondamento (ver docs/pricing.md):
 *  - cálculos intermediários com precisão total (40 dígitos significativos);
 *  - valores exibidos/persistidos são arredondados para centavos com ROUND_HALF_UP;
 *  - preços sugeridos são arredondados PARA CIMA ao centavo, para nunca ficarem abaixo da meta.
 */
export const D = Decimal.clone({ precision: 40, rounding: Decimal.ROUND_HALF_UP });
export type Dec = InstanceType<typeof D>;
export type DecimalInput = Dec | string | number;

export function dec(value: DecimalInput): Dec {
  if (typeof value === "number" && !Number.isFinite(value)) throw new Error("Valor numérico inválido");
  return new D(value);
}

export function toCents(value: DecimalInput): Dec {
  return dec(value).toDecimalPlaces(2, D.ROUND_HALF_UP);
}

export function ceilCents(value: DecimalInput): Dec {
  return dec(value).toDecimalPlaces(2, D.ROUND_CEIL);
}

export function sum(values: DecimalInput[]): Dec {
  return values.reduce<Dec>((acc, v) => acc.plus(dec(v)), dec(0));
}

/** Converte "1.234,56", "1234.56", "R$ 10,00" ou number em Decimal. Retorna null se inválido. */
export function parseBrlAmount(input: unknown): Dec | null {
  if (typeof input === "number") return Number.isFinite(input) ? dec(input) : null;
  if (typeof input !== "string") return null;
  let s = input.trim().replace(/^R\$\s*/i, "").replace(/\s/g, "");
  if (!s) return null;
  if (/^-?\d{1,3}(\.\d{3})+(,\d+)?$/.test(s) || /^-?\d+,\d+$/.test(s)) {
    s = s.replace(/\./g, "").replace(",", ".");
  } else if (/^-?\d{1,3}(,\d{3})+(\.\d+)?$/.test(s)) {
    s = s.replace(/,/g, "");
  }
  if (!/^-?\d+(\.\d+)?$/.test(s)) return null;
  return dec(s);
}

/** Converte percentual "12,5" / "12.5%" / 12.5 em fração (0.125). */
export function parsePercent(input: unknown): Dec | null {
  if (typeof input === "string") input = input.replace("%", "");
  const value = parseBrlAmount(input);
  return value === null ? null : value.div(100);
}

const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const pct = new Intl.NumberFormat("pt-BR", { style: "percent", minimumFractionDigits: 1, maximumFractionDigits: 2 });

export function formatBRL(value: DecimalInput | null | undefined): string {
  if (value === null || value === undefined) return "—";
  return brl.format(toCents(value).toNumber());
}

export function formatPercent(fraction: DecimalInput | null | undefined): string {
  if (fraction === null || fraction === undefined) return "—";
  return pct.format(dec(fraction).toNumber());
}
