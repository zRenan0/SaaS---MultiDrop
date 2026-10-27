import "server-only";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { logger } from "@/lib/logging/logger";
import { AuthorizationError, NotFoundError, ValidationError, type ActionResult } from "@/server/errors";
import { MissingConfigurationError } from "@/lib/env";

/** Executa uma Server Action padronizando validação, erros e logs (sem vazar detalhes internos). */
export async function runAction<T = undefined>(name: string, fn: () => Promise<ActionResult<T>>): Promise<ActionResult<T>> {
  try {
    return await fn();
  } catch (error) {
    if (error instanceof ValidationError) return { ok: false, error: error.message, fieldErrors: error.fieldErrors };
    if (error instanceof AuthorizationError || error instanceof NotFoundError) return { ok: false, error: error.message };
    if (error instanceof MissingConfigurationError) {
      return { ok: false, error: `Integração não configurada. Variáveis ausentes: ${error.variables.join(", ")}.` };
    }
    // redirect()/notFound() do Next.js lançam erros de controle que precisam propagar.
    if (error && typeof error === "object" && "digest" in error && typeof error.digest === "string" && error.digest.startsWith("NEXT_")) {
      throw error;
    }
    const errorId = randomUUID();
    logger.error("action_failed", { action: name, errorId, error });
    return { ok: false, error: `Erro inesperado (código ${errorId.slice(0, 8)}). Tente novamente ou consulte Operações.` };
  }
}

export function parseInput<S extends z.ZodType>(schema: S, input: unknown): z.infer<S> {
  const result = schema.safeParse(input);
  if (!result.success) {
    const fieldErrors: Record<string, string[]> = {};
    for (const issue of result.error.issues) {
      const key = issue.path.join(".") || "_";
      (fieldErrors[key] ??= []).push(issue.message);
    }
    throw new ValidationError("Revise os campos destacados.", fieldErrors);
  }
  return result.data;
}

export function formDataToObject(formData: FormData): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of formData.entries()) {
    if (typeof value === "string" && !key.startsWith("$ACTION")) out[key] = value;
  }
  return out;
}
