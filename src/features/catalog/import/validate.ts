import { productOfferSchema, type ProductOfferInput } from "@/features/catalog/schemas";
import { normalizeSku } from "@/features/catalog/normalize";
import { IMPORT_FIELD_KEYS, IMPORT_FIELDS, type ColumnMapping } from "@/features/catalog/import/mapping";
import type { ParsedTable } from "@/features/catalog/import/parse";
import { IMPORT_LIMITS } from "@/features/catalog/import/limits";

export type RowError = { row: number; field: string; message: string };
export type ValidRow = ProductOfferInput & { row: number; sku: string };
export type ValidationReport = {
  valid: ValidRow[];
  errors: RowError[];
  rejectedRows: number;
  duplicateRowsInFile: number;
  totalRows: number;
};

/** Valida todas as linhas. Número da linha considera o cabeçalho como linha 1, como na planilha. */
export function validateRows(table: ParsedTable, mapping: ColumnMapping): ValidationReport {
  const valid: ValidRow[] = [];
  const errors: RowError[] = [];
  const rejected = new Set<number>();
  const seenSku = new Map<string, number>();
  let duplicateRowsInFile = 0;

  table.rows.forEach((cells, index) => {
    const rowNumber = index + 2;
    const raw: Record<string, string> = {};
    for (const field of IMPORT_FIELD_KEYS) {
      const col = mapping[field];
      if (col !== undefined) raw[field] = cells[col] ?? "";
    }
    const parsed = productOfferSchema.safeParse(raw);
    if (!parsed.success) {
      rejected.add(rowNumber);
      for (const issue of parsed.error.issues) {
        const field = String(issue.path[0] ?? "_");
        const label = field in IMPORT_FIELDS ? IMPORT_FIELDS[field as keyof typeof IMPORT_FIELDS].label : field;
        errors.push({ row: rowNumber, field: label, message: issue.message });
      }
      return;
    }
    const sku = normalizeSku(parsed.data.sku);
    const firstRow = seenSku.get(sku);
    if (firstRow !== undefined) {
      duplicateRowsInFile++;
      rejected.add(rowNumber);
      errors.push({ row: rowNumber, field: IMPORT_FIELDS.sku.label, message: `SKU duplicado no arquivo (já aparece na linha ${firstRow}).` });
      return;
    }
    seenSku.set(sku, rowNumber);
    valid.push({ ...parsed.data, sku, row: rowNumber });
  });

  return {
    valid,
    errors: errors.slice(0, IMPORT_LIMITS.maxStoredErrors),
    rejectedRows: rejected.size,
    duplicateRowsInFile,
    totalRows: table.rows.length,
  };
}

/** CSV de linhas rejeitadas para o usuário corrigir e reimportar. Neutraliza fórmulas na saída. */
export function errorsToCsv(errors: RowError[]): string {
  const escape = (v: string) => {
    const safe = /^[=+\-@\t\r]/.test(v) ? `'${v}` : v;
    return `"${safe.replace(/"/g, '""')}"`;
  };
  const lines = ["linha;campo;erro", ...errors.map((e) => [String(e.row), e.field, e.message].map(escape).join(";"))];
  return lines.join("\r\n");
}
