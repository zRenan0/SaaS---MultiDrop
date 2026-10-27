import { Table, TableBody, TableCell, TableRow } from "@/components/ui/table";
import { StatusBadge } from "@/components/ui/status-badge";
import { formatBRL, formatPercent } from "@/lib/money";
import type { PriceEvaluation } from "@/features/pricing/engine";
import { cn } from "@/lib/utils";

export function Breakdown({ evaluation, title }: { evaluation: PriceEvaluation; title: string }) {
  const profit = Number(evaluation.profit);
  return (
    <div className="rounded-lg border">
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b p-3">
        <h3 className="text-sm font-medium">{title}</h3>
        <span className="text-xs text-muted-foreground">
          Margem {formatPercent(evaluation.margin)} · Markup {formatPercent(evaluation.markup)}
        </span>
      </div>
      <Table>
        <TableBody>
          {evaluation.lines.map((line) => (
            <TableRow key={line.key} className={cn(line.kind === "result" && "font-semibold", line.kind === "revenue" && "font-medium")}>
              <TableCell>
                {line.label}
                {line.rate ? <span className="text-muted-foreground"> ({formatPercent(line.rate)})</span> : null}
                {line.estimated && line.kind !== "result" ? <StatusBadge tone="warning" className="ml-2">estimado</StatusBadge> : null}
              </TableCell>
              <TableCell
                className={cn(
                  "text-right tabular-nums",
                  line.kind === "cost" || line.kind === "rate_cost" ? "text-muted-foreground" : "",
                  line.kind === "result" && (profit < 0 ? "text-destructive" : "text-success"),
                )}
              >
                {line.kind === "cost" || line.kind === "rate_cost" ? `− ${formatBRL(line.amount)}` : formatBRL(line.amount)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
