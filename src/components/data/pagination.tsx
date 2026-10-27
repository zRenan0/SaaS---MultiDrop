import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";

export function buildHref(pathname: string, params: Record<string, string | undefined>, patch: Record<string, string | undefined>) {
  const merged = { ...params, ...patch };
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(merged)) if (value) search.set(key, value);
  const qs = search.toString();
  return qs ? `${pathname}?${qs}` : pathname;
}

export function Pagination({
  pathname,
  params,
  page,
  pageSize,
  total,
}: {
  pathname: string;
  params: Record<string, string | undefined>;
  page: number;
  pageSize: number;
  total: number;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  return (
    <nav aria-label="Paginação" className="flex items-center justify-between gap-2 pt-4 text-sm">
      <span className="text-muted-foreground">
        {from}–{to} de {total.toLocaleString("pt-BR")}
      </span>
      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" asChild={page > 1} disabled={page <= 1}>
          {page > 1 ? (
            <Link href={buildHref(pathname, params, { page: String(page - 1) })} aria-label="Página anterior">
              <ChevronLeft aria-hidden /> Anterior
            </Link>
          ) : (
            <span>
              <ChevronLeft aria-hidden /> Anterior
            </span>
          )}
        </Button>
        <span aria-current="page">
          {page} / {pages}
        </span>
        <Button variant="outline" size="sm" asChild={page < pages} disabled={page >= pages}>
          {page < pages ? (
            <Link href={buildHref(pathname, params, { page: String(page + 1) })} aria-label="Próxima página">
              Próxima <ChevronRight aria-hidden />
            </Link>
          ) : (
            <span>
              Próxima <ChevronRight aria-hidden />
            </span>
          )}
        </Button>
      </div>
    </nav>
  );
}

export function SortLink({
  pathname,
  params,
  field,
  label,
}: {
  pathname: string;
  params: Record<string, string | undefined>;
  field: string;
  label: string;
}) {
  const active = params.sort === field;
  const nextDir = active && params.dir === "asc" ? "desc" : "asc";
  return (
    <Link
      href={buildHref(pathname, params, { sort: field, dir: nextDir, page: undefined })}
      className="inline-flex items-center gap-1 hover:underline"
      aria-sort={active ? (params.dir === "asc" ? "ascending" : "descending") : undefined}
    >
      {label}
      {active ? <span aria-hidden>{params.dir === "asc" ? "↑" : "↓"}</span> : null}
    </Link>
  );
}

/** Lê parâmetros de busca como strings simples. */
export function flatParams(raw: Record<string, string | string[] | undefined>): Record<string, string | undefined> {
  const out: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(raw)) out[k] = Array.isArray(v) ? v[0] : v;
  return out;
}

export function pageNumber(value: string | undefined): number {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 && n < 100000 ? n : 1;
}
