"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { sha256Hex } from "@/lib/security/crypto";
import { parseInput, runAction } from "@/server/action";
import { audit } from "@/server/audit";
import { describeDbError, type ActionResult } from "@/server/errors";
import { requirePermission } from "@/server/session";
import { asJson } from "@/lib/db-values";
import { IMPORT_FIELD_KEYS, missingRequiredFields, suggestMapping, type ColumnMapping } from "@/features/catalog/import/mapping";
import { ImportFileError, parseImportFile } from "@/features/catalog/import/parse";
import { validateRows, type RowError } from "@/features/catalog/import/validate";
import { toUpsertRow, upsertCatalogRows } from "@/features/catalog/service";
import { IMPORT_LIMITS } from "@/features/catalog/import/limits";

export type AnalyzeResult = { fileName: string; headers: string[]; sample: string[][]; totalRows: number; suggested: ColumnMapping };
export type PreviewResult = {
  runId: string;
  totalRows: number;
  validRows: number;
  rejectedRows: number;
  duplicateRowsInFile: number;
  existingOffers: number;
  errors: RowError[];
  sample: { row: number; title: string; sku: string; cost: string; stock: number }[];
};

const mappingSchema = z
  .string()
  .transform((v, ctx) => {
    try {
      return JSON.parse(v) as unknown;
    } catch {
      ctx.addIssue({ code: "custom", message: "Mapeamento inválido." });
      return z.NEVER;
    }
  })
  // partialRecord: no Zod 4, record com chaves enum exige todas as chaves.
  .pipe(z.partialRecord(z.enum(IMPORT_FIELD_KEYS as [string, ...string[]]), z.number().int().min(0).max(IMPORT_LIMITS.maxColumns)));

async function readUpload(formData: FormData) {
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) throw new ImportFileError("Selecione um arquivo .csv ou .xlsx.");
  if (file.size > IMPORT_LIMITS.maxFileBytes) throw new ImportFileError("O arquivo excede 5 MB.");
  const bytes = new Uint8Array(await file.arrayBuffer());
  return { name: file.name.slice(0, 255), bytes, sha256: sha256Hex(Buffer.from(bytes)) };
}

function fileError<T>(error: unknown): ActionResult<T> | null {
  return error instanceof ImportFileError ? { ok: false, error: error.message } : null;
}

/** Passo 1: lê cabeçalho e amostra e sugere o mapeamento de colunas. */
export async function analyzeImportAction(formData: FormData): Promise<ActionResult<AnalyzeResult>> {
  return runAction<AnalyzeResult>("imports.analyze", async () => {
    await requirePermission("imports.run");
    try {
      const upload = await readUpload(formData);
      const table = await parseImportFile(upload.name, upload.bytes);
      return {
        ok: true,
        data: { fileName: upload.name, headers: table.headers, sample: table.rows.slice(0, 5), totalRows: table.rows.length, suggested: suggestMapping(table.headers) },
      };
    } catch (error) {
      const handled = fileError<AnalyzeResult>(error);
      if (handled) return handled;
      throw error;
    }
  });
}

/** Passo 2: valida todas as linhas com o mapeamento escolhido e registra a execução como "prévia". */
export async function previewImportAction(formData: FormData): Promise<ActionResult<PreviewResult>> {
  return runAction<PreviewResult>("imports.preview", async () => {
    const ctx = await requirePermission("imports.run");
    const connectionId = parseInput(z.uuid("Selecione o fornecedor."), formData.get("supplierConnectionId"));
    const mapping = parseInput(mappingSchema, formData.get("mapping")) as ColumnMapping;
    const missing = missingRequiredFields(mapping);
    if (missing.length > 0) return { ok: false, error: `Mapeie as colunas obrigatórias: ${missing.join(", ")}.` };

    try {
      const upload = await readUpload(formData);
      const table = await parseImportFile(upload.name, upload.bytes);
      for (const index of Object.values(mapping)) {
        if (index !== undefined && index >= table.headers.length) return { ok: false, error: "Mapeamento aponta para coluna inexistente." };
      }
      const report = validateRows(table, mapping);
      const supabase = await createClient();

      const { data: connection } = await supabase
        .from("supplier_connections")
        .select("id, status")
        .eq("id", connectionId)
        .eq("organization_id", ctx.organization.id)
        .maybeSingle();
      if (!connection || connection.status === "disabled") return { ok: false, error: "Fornecedor inválido ou desativado." };

      // Ofertas que serão atualizadas (mesmo SKU já cadastrado para este fornecedor).
      let existingOffers = 0;
      const skus = report.valid.map((r) => r.sku);
      for (let i = 0; i < skus.length; i += 500) {
        const { count } = await supabase
          .from("supplier_offers")
          .select("id", { count: "exact", head: true })
          .eq("organization_id", ctx.organization.id)
          .eq("supplier_connection_id", connectionId)
          .in("sku", skus.slice(i, i + 500));
        existingOffers += count ?? 0;
      }

      const { data: run, error } = await supabase
        .from("catalog_import_runs")
        .insert({
          organization_id: ctx.organization.id,
          supplier_connection_id: connectionId,
          file_name: upload.name,
          file_type: table.fileType,
          file_sha256: upload.sha256,
          status: "previewed",
          column_mapping: asJson(mapping),
          rows_total: report.totalRows,
          rows_rejected: report.rejectedRows,
          errors: asJson(report.errors),
          created_by: ctx.user.id,
        })
        .select("id")
        .single();
      if (error) return { ok: false, error: describeDbError(error) };

      return {
        ok: true,
        data: {
          runId: run.id,
          totalRows: report.totalRows,
          validRows: report.valid.length,
          rejectedRows: report.rejectedRows,
          duplicateRowsInFile: report.duplicateRowsInFile,
          existingOffers,
          errors: report.errors.slice(0, 100),
          sample: report.valid.slice(0, 10).map((r) => ({ row: r.row, title: r.title, sku: r.sku, cost: r.cost, stock: r.stock })),
        },
      };
    } catch (error) {
      const handled = fileError<PreviewResult>(error);
      if (handled) return handled;
      throw error;
    }
  });
}

/** Passo 3: importa as linhas válidas. Exige o mesmo arquivo (hash) usado na prévia. */
export async function commitImportAction(formData: FormData): Promise<ActionResult<{ runId: string }>> {
  return runAction<{ runId: string }>("imports.commit", async () => {
    const ctx = await requirePermission("imports.run");
    const runId = parseInput(z.uuid(), formData.get("runId"));
    const supabase = await createClient();
    const { data: run } = await supabase
      .from("catalog_import_runs")
      .select("id, status, file_sha256, column_mapping, supplier_connection_id")
      .eq("id", runId)
      .eq("organization_id", ctx.organization.id)
      .maybeSingle();
    if (!run) return { ok: false, error: "Importação não encontrada." };
    if (run.status !== "previewed") return { ok: false, error: "Esta importação já foi processada. Inicie uma nova." };

    let upload;
    let report;
    try {
      upload = await readUpload(formData);
      if (upload.sha256 !== run.file_sha256) return { ok: false, error: "O arquivo enviado é diferente do arquivo da prévia." };
      const table = await parseImportFile(upload.name, upload.bytes);
      report = validateRows(table, run.column_mapping as ColumnMapping);
    } catch (error) {
      const handled = fileError<{ runId: string }>(error);
      if (handled) return handled;
      throw error;
    }

    // Marca como em processamento (evita processamento duplo por cliques repetidos).
    const { data: locked } = await supabase
      .from("catalog_import_runs")
      .update({ status: "importing" })
      .eq("id", run.id)
      .eq("status", "previewed")
      .select("id");
    if (!locked?.length) return { ok: false, error: "Esta importação já está em processamento." };

    const { data, error } = await upsertCatalogRows(supabase, {
      organizationId: ctx.organization.id,
      connectionId: run.supplier_connection_id,
      source: "file_import",
      rows: report.valid.map((row) => toUpsertRow(row)),
    });

    if (error || !data) {
      const message = describeDbError(error, "Falha ao gravar as linhas.");
      await supabase
        .from("catalog_import_runs")
        .update({
          status: "failed",
          finished_at: new Date().toISOString(),
          errors: asJson([...report.errors, { row: 0, field: "importação", message }].slice(0, IMPORT_LIMITS.maxStoredErrors)),
        })
        .eq("id", run.id);
      revalidatePath("/app/imports");
      return { ok: false, error: `Nenhuma linha foi importada: ${message}` };
    }

    await supabase
      .from("catalog_import_runs")
      .update({
        status: "completed",
        rows_processed: report.totalRows,
        rows_imported: data.createdOffers,
        rows_updated: data.updatedOffers,
        rows_rejected: report.rejectedRows,
        finished_at: new Date().toISOString(),
      })
      .eq("id", run.id);
    await audit({ organizationId: ctx.organization.id, actorUserId: ctx.user.id, action: "catalog.import", entityType: "catalog_import_run", entityId: run.id, metadata: data });
    revalidatePath("/app/imports");
    revalidatePath("/app/products");
    return {
      ok: true,
      message: `Importação concluída: ${data.createdOffers} oferta(s) nova(s), ${data.updatedOffers} atualizada(s), ${data.createdProducts} produto(s) criado(s), ${report.rejectedRows} linha(s) rejeitada(s).`,
      data: { runId: run.id },
    };
  });
}
