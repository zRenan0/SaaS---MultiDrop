import Papa from "papaparse";
import { IMPORT_LIMITS } from "@/features/catalog/import/limits";

export type ParsedTable = { headers: string[]; rows: string[][] };

export class ImportFileError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ImportFileError";
  }
}

export function detectFileType(fileName: string, bytes: Uint8Array): "csv" | "xlsx" {
  const lower = fileName.toLowerCase();
  const isZip = bytes.length > 4 && bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04;
  if (lower.endsWith(".xlsx")) {
    if (!isZip) throw new ImportFileError("O arquivo .xlsx está corrompido ou não é uma planilha Excel válida.");
    return "xlsx";
  }
  if (lower.endsWith(".csv") || lower.endsWith(".txt")) {
    if (isZip) throw new ImportFileError("O conteúdo não corresponde a um CSV.");
    return "csv";
  }
  throw new ImportFileError("Formato não suportado. Envie um arquivo .csv ou .xlsx (o formato .xls antigo não é aceito).");
}

function cellToString(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

function finalize(rawRows: unknown[][]): ParsedTable {
  const rows = rawRows
    .map((r) => r.map(cellToString))
    .filter((r) => r.some((cell) => cell.trim() !== ""));
  if (rows.length === 0) throw new ImportFileError("O arquivo está vazio.");
  const headers = rows[0].map((h) => h.trim());
  if (headers.length > IMPORT_LIMITS.maxColumns) throw new ImportFileError(`O arquivo tem mais de ${IMPORT_LIMITS.maxColumns} colunas.`);
  if (headers.every((h) => h === "")) throw new ImportFileError("A primeira linha deve conter os nomes das colunas.");
  const body = rows.slice(1);
  if (body.length === 0) throw new ImportFileError("O arquivo não tem linhas de dados.");
  if (body.length > IMPORT_LIMITS.maxRows) {
    throw new ImportFileError(`O arquivo tem ${body.length} linhas; o máximo por importação é ${IMPORT_LIMITS.maxRows}. Divida em arquivos menores.`);
  }
  for (const row of body) {
    for (const cell of row) {
      if (cell.length > IMPORT_LIMITS.maxCellLength) throw new ImportFileError("Há células com conteúdo grande demais.");
    }
  }
  return { headers, rows: body.map((r) => headers.map((_, i) => (r[i] ?? "").trim())) };
}

function decodeText(bytes: Uint8Array): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes).replace(/^﻿/, "");
  } catch {
    // Planilhas exportadas pelo Excel no Brasil costumam vir em Windows-1252.
    return new TextDecoder("windows-1252").decode(bytes);
  }
}

export function parseCsv(bytes: Uint8Array): ParsedTable {
  const text = decodeText(bytes);
  const result = Papa.parse<string[]>(text, { skipEmptyLines: "greedy", delimiter: "", preview: IMPORT_LIMITS.maxRows + 2 });
  const fatal = result.errors.find((e) => e.type === "Quotes");
  if (fatal) throw new ImportFileError(`CSV inválido na linha ${fatal.row ?? "?"}: aspas não fechadas.`);
  return finalize(result.data);
}

export async function parseXlsx(bytes: Uint8Array): Promise<ParsedTable> {
  const { readSheet } = await import("read-excel-file/node");
  try {
    // Números são mantidos como texto para preservar casas decimais exatas.
    const data = await readSheet<string>(Buffer.from(bytes), 1, { parseNumber: (s) => s, trim: true });
    return finalize(data as unknown[][]);
  } catch (error) {
    if (error instanceof ImportFileError) throw error;
    throw new ImportFileError("Não foi possível ler a planilha. Verifique se o arquivo .xlsx não está protegido ou corrompido.");
  }
}

export async function parseImportFile(fileName: string, bytes: Uint8Array): Promise<ParsedTable & { fileType: "csv" | "xlsx" }> {
  if (bytes.length === 0) throw new ImportFileError("O arquivo está vazio.");
  if (bytes.length > IMPORT_LIMITS.maxFileBytes) throw new ImportFileError("O arquivo excede 5 MB.");
  const fileType = detectFileType(fileName, bytes);
  const table = fileType === "csv" ? parseCsv(bytes) : await parseXlsx(bytes);
  return { ...table, fileType };
}
