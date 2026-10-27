"use client";

import { useRef, useState, useTransition } from "react";
import Link from "next/link";
import { AlertCircle, CheckCircle2, Loader2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Label } from "@/components/ui/label";
import { analyzeImportAction, commitImportAction, previewImportAction, type AnalyzeResult, type PreviewResult } from "@/features/catalog/import/actions";
import { IMPORT_FIELD_KEYS, IMPORT_FIELDS, missingRequiredFields, type ColumnMapping, type ImportField } from "@/features/catalog/import/mapping";
import { formatBRL } from "@/lib/money";

type Connection = { id: string; display_name: string };

export function ImportWizard({ connections }: { connections: Connection[] }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [connectionId, setConnectionId] = useState("");
  const [analysis, setAnalysis] = useState<AnalyzeResult | null>(null);
  const [mapping, setMapping] = useState<ColumnMapping>({});
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [done, setDone] = useState<{ message: string; runId: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function reset() {
    setAnalysis(null);
    setPreview(null);
    setDone(null);
    setError(null);
  }

  function formWithFile(extra: Record<string, string> = {}) {
    const fd = new FormData();
    if (file) fd.set("file", file);
    for (const [k, v] of Object.entries(extra)) fd.set(k, v);
    return fd;
  }

  function analyze(selected: File) {
    reset();
    setFile(selected);
    const fd = new FormData();
    fd.set("file", selected);
    startTransition(async () => {
      const result = await analyzeImportAction(fd);
      if (!result.ok) return setError(result.error);
      setAnalysis(result.data!);
      setMapping(result.data!.suggested);
    });
  }

  function runPreview() {
    setError(null);
    setPreview(null);
    startTransition(async () => {
      const result = await previewImportAction(formWithFile({ supplierConnectionId: connectionId, mapping: JSON.stringify(mapping) }));
      if (!result.ok) return setError(result.error);
      setPreview(result.data!);
    });
  }

  function commit() {
    if (!preview) return;
    setError(null);
    startTransition(async () => {
      const result = await commitImportAction(formWithFile({ runId: preview.runId }));
      if (!result.ok) return setError(result.error);
      setDone({ message: result.message ?? "Importação concluída.", runId: result.data!.runId });
    });
  }

  const missing = missingRequiredFields(mapping);

  if (done) {
    return (
      <Card>
        <CardContent className="grid gap-4">
          <Alert role="status">
            <CheckCircle2 aria-hidden />
            <AlertDescription>{done.message}</AlertDescription>
          </Alert>
          <div className="flex flex-wrap gap-2">
            <Button asChild>
              <Link href={`/app/imports/${done.runId}`}>Ver relatório</Link>
            </Button>
            <Button variant="outline" asChild>
              <Link href="/app/products">Ver produtos</Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid gap-6">
      {error ? (
        <Alert variant="destructive" role="alert">
          <AlertCircle aria-hidden />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>1. Arquivo e fornecedor</CardTitle>
          <CardDescription>CSV (separado por vírgula ou ponto e vírgula) ou Excel .xlsx, até 5 MB e 5.000 linhas. A primeira linha deve conter os nomes das colunas.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-1.5">
            <Label htmlFor="supplier">Fornecedor das ofertas</Label>
            <select id="supplier" value={connectionId} onChange={(e) => setConnectionId(e.target.value)} className="h-8 rounded-lg border bg-background px-2 text-sm">
              <option value="">Selecione</option>
              {connections.map((c) => (
                <option key={c.id} value={c.id}>{c.display_name}</option>
              ))}
            </select>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="file">Arquivo</Label>
            <input
              ref={fileRef}
              id="file"
              type="file"
              accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              className="text-sm file:mr-3 file:rounded-md file:border file:bg-muted file:px-3 file:py-1"
              onChange={(e) => {
                const selected = e.target.files?.[0];
                if (selected) analyze(selected);
              }}
            />
          </div>
          {pending && !analysis ? (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" aria-hidden /> Lendo arquivo…
            </p>
          ) : null}
        </CardContent>
      </Card>

      {analysis ? (
        <Card>
          <CardHeader>
            <CardTitle>2. Mapeamento de colunas</CardTitle>
            <CardDescription>
              {analysis.fileName}: {analysis.totalRows} linha(s). Associe cada campo a uma coluna do arquivo. Campos com * são obrigatórios.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {IMPORT_FIELD_KEYS.map((field: ImportField) => (
                <div key={field} className="grid gap-1">
                  <Label htmlFor={`map-${field}`}>
                    {IMPORT_FIELDS[field].label}
                    {IMPORT_FIELDS[field].required ? " *" : ""}
                  </Label>
                  <select
                    id={`map-${field}`}
                    value={mapping[field] ?? ""}
                    onChange={(e) => {
                      setPreview(null);
                      setMapping((m) => {
                        const next = { ...m };
                        if (e.target.value === "") delete next[field];
                        else next[field] = Number(e.target.value);
                        return next;
                      });
                    }}
                    className="h-8 rounded-lg border bg-background px-2 text-sm"
                  >
                    <option value="">Não importar</option>
                    {analysis.headers.map((h, i) => (
                      <option key={`${h}-${i}`} value={i}>{h || `Coluna ${i + 1}`}</option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
            <div className="overflow-x-auto">
              <p className="mb-2 text-xs text-muted-foreground">Amostra das primeiras linhas do arquivo</p>
              <Table>
                <TableHeader>
                  <TableRow>
                    {analysis.headers.map((h, i) => <TableHead key={i}>{h}</TableHead>)}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {analysis.sample.map((row, r) => (
                    <TableRow key={r}>
                      {row.map((cell, c) => <TableCell key={c} className="max-w-48 truncate">{cell}</TableCell>)}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <Button onClick={runPreview} disabled={pending || missing.length > 0 || !connectionId}>
                {pending ? <Loader2 className="animate-spin" aria-hidden /> : <Upload aria-hidden />} Validar e pré-visualizar
              </Button>
              {missing.length > 0 ? <span className="text-sm text-destructive">Mapeie: {missing.map((f) => IMPORT_FIELDS[f].label).join(", ")}</span> : null}
              {!connectionId ? <span className="text-sm text-muted-foreground">Selecione o fornecedor.</span> : null}
            </div>
          </CardContent>
        </Card>
      ) : null}

      {preview ? (
        <Card>
          <CardHeader>
            <CardTitle>3. Prévia</CardTitle>
            <CardDescription>Nada foi gravado ainda. Revise antes de confirmar.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-5">
              {[
                ["Linhas", preview.totalRows],
                ["Válidas", preview.validRows],
                ["Rejeitadas", preview.rejectedRows],
                ["Duplicadas no arquivo", preview.duplicateRowsInFile],
                ["Atualizarão ofertas existentes", preview.existingOffers],
              ].map(([label, value]) => (
                <div key={label} className="rounded-lg border p-3">
                  <dt className="text-muted-foreground">{label}</dt>
                  <dd className="text-xl font-semibold tabular-nums" data-testid={`preview-${label}`}>{value}</dd>
                </div>
              ))}
            </dl>
            {preview.errors.length > 0 ? (
              <div className="overflow-x-auto">
                <p className="mb-2 text-sm font-medium">Linhas rejeitadas (corrija no arquivo e importe novamente)</p>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Linha</TableHead>
                      <TableHead>Campo</TableHead>
                      <TableHead>Problema</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {preview.errors.map((e, i) => (
                      <TableRow key={i}>
                        <TableCell>{e.row}</TableCell>
                        <TableCell>{e.field}</TableCell>
                        <TableCell>{e.message}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : null}
            {preview.sample.length > 0 ? (
              <div className="overflow-x-auto">
                <p className="mb-2 text-sm font-medium">Amostra das linhas válidas</p>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Linha</TableHead>
                      <TableHead>SKU</TableHead>
                      <TableHead>Título</TableHead>
                      <TableHead className="text-right">Custo</TableHead>
                      <TableHead className="text-right">Estoque</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {preview.sample.map((r) => (
                      <TableRow key={r.row}>
                        <TableCell>{r.row}</TableCell>
                        <TableCell className="font-mono text-xs">{r.sku}</TableCell>
                        <TableCell>{r.title}</TableCell>
                        <TableCell className="text-right">{formatBRL(r.cost)}</TableCell>
                        <TableCell className="text-right">{r.stock}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : null}
            <div>
              <Button onClick={commit} disabled={pending || preview.validRows === 0}>
                {pending ? <Loader2 className="animate-spin" aria-hidden /> : null} Importar {preview.validRows} linha(s) válida(s)
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
