import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { errorsToCsv, type RowError } from "@/features/catalog/import/validate";
import { getOrgContext } from "@/server/session";

/** Download das linhas rejeitadas (RLS garante que só membros da empresa acessem). */
export async function GET(_request: NextRequest, { params }: RouteContext<"/app/imports/[id]/errors">) {
  const { id } = await params;
  const ctx = await getOrgContext();
  if (!ctx || !/^[0-9a-f-]{36}$/.test(id)) return new NextResponse("Não encontrado", { status: 404 });
  const supabase = await createClient();
  const { data } = await supabase
    .from("catalog_import_runs")
    .select("file_name, errors")
    .eq("id", id)
    .eq("organization_id", ctx.organization.id)
    .maybeSingle();
  if (!data) return new NextResponse("Não encontrado", { status: 404 });
  const csv = "﻿" + errorsToCsv((Array.isArray(data.errors) ? data.errors : []) as RowError[]);
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="rejeitadas-${id.slice(0, 8)}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
