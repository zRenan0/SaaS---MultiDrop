import { describe, expect, it } from "vitest";
import { ceilCents, dec, formatBRL, formatPercent, parseBrlAmount, parsePercent, sum, toCents } from "@/lib/money";

describe("aritmética monetária", () => {
  it("evita erro de ponto flutuante", () => {
    expect(sum(["0.1", "0.2"]).toString()).toBe("0.3");
    expect(dec("19.99").times(3).toString()).toBe("59.97");
  });

  it("arredonda centavos com ROUND_HALF_UP", () => {
    expect(toCents("1.005").toFixed(2)).toBe("1.01");
    expect(toCents("1.004").toFixed(2)).toBe("1.00");
    expect(toCents("-1.005").toFixed(2)).toBe("-1.01");
  });

  it("preço sugerido arredonda para cima", () => {
    expect(ceilCents("10.001").toFixed(2)).toBe("10.01");
    expect(ceilCents("10.00").toFixed(2)).toBe("10.00");
  });

  it("interpreta formatos brasileiros e internacionais", () => {
    expect(parseBrlAmount("R$ 1.234,56")?.toString()).toBe("1234.56");
    expect(parseBrlAmount("1234,5")?.toString()).toBe("1234.5");
    expect(parseBrlAmount("1234.56")?.toString()).toBe("1234.56");
    expect(parseBrlAmount("1,234.56")?.toString()).toBe("1234.56");
    expect(parseBrlAmount("10")?.toString()).toBe("10");
    expect(parseBrlAmount(12.5)?.toString()).toBe("12.5");
    expect(parseBrlAmount("abc")).toBeNull();
    expect(parseBrlAmount("")).toBeNull();
    expect(parseBrlAmount("1.2.3")).toBeNull();
    expect(parseBrlAmount(Number.NaN)).toBeNull();
  });

  it("converte percentuais em fração", () => {
    expect(parsePercent("12,5%")?.toString()).toBe("0.125");
    expect(parsePercent(16)?.toString()).toBe("0.16");
  });

  it("formata em reais e percentual pt-BR", () => {
    expect(formatBRL("1234.5").replace(/\s/g, " ")).toBe("R$ 1.234,50");
    expect(formatBRL(null)).toBe("—");
    expect(formatPercent("0.125")).toBe("12,5%");
  });
});
