import { describe, expect, it } from "vitest";
import writeXlsxFile from "write-excel-file/node";
import { isDangerousCell, isSafePublicUrl, isValidGtin, normalizeSku, normalizeTitle, productFingerprint } from "@/features/catalog/normalize";
import { missingRequiredFields, suggestMapping } from "@/features/catalog/import/mapping";
import { ImportFileError, parseImportFile } from "@/features/catalog/import/parse";
import { errorsToCsv, validateRows } from "@/features/catalog/import/validate";
import { createProductSchema } from "@/features/catalog/schemas";

const enc = (s: string) => new TextEncoder().encode(s);

describe("normalização", () => {
  it("normaliza títulos e SKUs", () => {
    expect(normalizeTitle("  Fone de Ouvido BLUETOOTH  5.0 – Preto ")).toBe("fone de ouvido bluetooth 5 0 preto");
    expect(normalizeSku(" ab-12 3 ")).toBe("AB-123");
    expect(productFingerprint({ title: "Fone X", brand: "ACME", model: "X1" })).toBe("acme|x1|fone x");
  });

  it("valida GTIN pelo dígito verificador", () => {
    expect(isValidGtin("7891000315507")).toBe(true);
    expect(isValidGtin("7891000315508")).toBe(false);
    expect(isValidGtin("96385074")).toBe(true);
    expect(isValidGtin("123")).toBe(false);
    expect(isValidGtin("78910003155O7")).toBe(false);
  });

  it("aceita apenas URLs https públicas", () => {
    expect(isSafePublicUrl("https://cdn.fornecedor.com.br/img/1.jpg")).toBe(true);
    expect(isSafePublicUrl("http://cdn.fornecedor.com.br/img/1.jpg")).toBe(false);
    expect(isSafePublicUrl("https://localhost/x.png")).toBe(false);
    expect(isSafePublicUrl("https://192.168.0.10/x.png")).toBe(false);
    expect(isSafePublicUrl("https://169.254.169.254/latest")).toBe(false);
    expect(isSafePublicUrl("https://user:pass@site.com/x.png")).toBe(false);
    expect(isSafePublicUrl("javascript:alert(1)")).toBe(false);
  });

  it("detecta fórmulas e caracteres de controle", () => {
    expect(isDangerousCell("=HYPERLINK(\"x\")")).toBe(true);
    expect(isDangerousCell("+55 11")).toBe(true);
    expect(isDangerousCell("@SUM(1)")).toBe(true);
    expect(isDangerousCell("-cmd")).toBe(true);
    expect(isDangerousCell("-10")).toBe(false);
    expect(isDangerousCell("Fone Bluetooth")).toBe(false);
  });
});

describe("mapeamento de colunas", () => {
  it("sugere mapeamento a partir de cabeçalhos em português", () => {
    const mapping = suggestMapping(["Código", "Nome do Produto", "Preço de Custo", "Qtd", "EAN", "Marca", "Preço"]);
    expect(mapping).toMatchObject({ sku: 0, title: 1, cost: 2, stock: 3, gtin: 4, brand: 5 });
    expect(missingRequiredFields(mapping)).toEqual([]);
    expect(missingRequiredFields({ title: 0 })).toEqual(["sku", "cost", "stock"]);
  });
});

describe("leitura de arquivos", () => {
  it("lê CSV com ponto e vírgula e BOM", async () => {
    const csv = "﻿sku;titulo;custo;estoque\nA1;Produto Um;10,50;3\n\nA2;Produto Dois;1.234,56;0\n";
    const table = await parseImportFile("lista.csv", enc(csv));
    expect(table.fileType).toBe("csv");
    expect(table.headers).toEqual(["sku", "titulo", "custo", "estoque"]);
    expect(table.rows).toEqual([
      ["A1", "Produto Um", "10,50", "3"],
      ["A2", "Produto Dois", "1.234,56", "0"],
    ]);
  });

  it("lê CSV em Windows-1252 (Excel brasileiro)", async () => {
    const bytes = new Uint8Array([...enc("sku,titulo\nA1,Cal"), 0xe7, 0x61, 0x64, 0x6f]);
    const table = await parseImportFile("lista.csv", bytes);
    expect(table.rows[0][1]).toBe("Calçado");
  });

  it("lê XLSX preservando decimais como texto", async () => {
    const buffer = await writeXlsxFile([
      [{ value: "SKU" }, { value: "Título" }, { value: "Custo" }, { value: "Estoque" }],
      [{ value: "X-1" }, { value: "Cabo USB-C" }, { value: 12.34 }, { value: 7 }],
    ]).toBuffer();
    const table = await parseImportFile("planilha.xlsx", new Uint8Array(buffer));
    expect(table.fileType).toBe("xlsx");
    expect(table.rows).toEqual([["X-1", "Cabo USB-C", "12.34", "7"]]);
  });

  it("rejeita formatos e conteúdos inválidos", async () => {
    await expect(parseImportFile("a.xls", enc("x"))).rejects.toBeInstanceOf(ImportFileError);
    await expect(parseImportFile("a.xlsx", enc("não é zip"))).rejects.toThrow(/corrompido/);
    await expect(parseImportFile("a.csv", enc(""))).rejects.toThrow(/vazio/);
    await expect(parseImportFile("a.csv", enc("sku,titulo\n"))).rejects.toThrow(/linhas de dados/);
    const many = "sku\n" + Array.from({ length: 5001 }, (_, i) => `S${i}`).join("\n");
    await expect(parseImportFile("a.csv", enc(many))).rejects.toThrow(/máximo/);
    await expect(parseImportFile("a.csv", new Uint8Array(5 * 1024 * 1024 + 1))).rejects.toThrow(/5 MB/);
  });
});

describe("validação de linhas", () => {
  const headers = ["sku", "titulo", "custo", "estoque", "ean", "imagens"];
  const mapping = { sku: 0, title: 1, cost: 2, stock: 3, gtin: 4, imageUrls: 5 };

  it("separa linhas válidas, rejeitadas e duplicadas", () => {
    const report = validateRows(
      {
        headers,
        rows: [
          ["a1", "Produto Um", "10,50", "3", "7891000315507", "https://cdn.x.com/1.jpg"],
          ["A1", "Produto Repetido", "11", "1", "", ""],
          ["A2", "=CMD()", "10", "1", "", ""],
          ["A3", "Produto Três", "-5", "1", "", ""],
          ["A4", "Produto Quatro", "5", "1,5", "", ""],
          ["A5", "Produto Cinco", "5", "2", "7891000315508", ""],
          ["A6", "Produto Seis", "5", "2", "", "http://inseguro.com/a.jpg"],
          ["A7", "Produto Sete", "R$ 1.000,00", "10", "", ""],
        ],
      },
      mapping,
    );
    expect(report.totalRows).toBe(8);
    expect(report.valid.map((r) => r.sku)).toEqual(["A1", "A7"]);
    expect(report.valid[0]).toMatchObject({ cost: "10.50", stock: 3, gtin: "7891000315507", imageUrls: ["https://cdn.x.com/1.jpg"] });
    expect(report.valid[1].cost).toBe("1000.00");
    expect(report.rejectedRows).toBe(6);
    expect(report.duplicateRowsInFile).toBe(1);
    expect(report.errors.find((e) => e.row === 3)?.message).toMatch(/duplicado/);
    expect(report.errors.find((e) => e.row === 4)?.message).toMatch(/não permitido/);
    expect(report.errors.find((e) => e.row === 7)?.message).toMatch(/GTIN/);
  });

  it("gera relatório CSV de erros sem fórmulas", () => {
    const csv = errorsToCsv([{ row: 2, field: "Título", message: "=perigo" }]);
    expect(csv).toContain("\"'=perigo\"");
  });

  it("valida cadastro manual", () => {
    const ok = createProductSchema.safeParse({
      supplierConnectionId: "4b0e6b7c-2d4f-4b3a-9a37-3a9b3e9d2f10",
      title: "Mouse sem fio",
      sku: "m-01",
      cost: "39,90",
      stock: "12",
      handlingTimeDays: "",
    });
    expect(ok.success).toBe(true);
    expect(ok.data?.handlingTimeDays).toBeUndefined();
    expect(ok.data?.inboundShippingCost).toBe("0");
  });
});
