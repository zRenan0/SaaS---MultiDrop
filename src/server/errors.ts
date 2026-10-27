export class AuthorizationError extends Error {
  constructor(message = "Você não tem permissão para realizar esta ação.") {
    super(message);
    this.name = "AuthorizationError";
  }
}

export class NotFoundError extends Error {
  constructor(message = "Registro não encontrado.") {
    super(message);
    this.name = "NotFoundError";
  }
}

export class ValidationError extends Error {
  constructor(
    message: string,
    public readonly fieldErrors: Record<string, string[]> = {},
  ) {
    super(message);
    this.name = "ValidationError";
  }
}

export type ActionResult<T = undefined> =
  | { ok: true; message?: string; data?: T }
  | { ok: false; error: string; fieldErrors?: Record<string, string[]> };

type PgLikeError = { code?: string; message?: string; hint?: string | null };

/** Converte erros do PostgREST/Postgres em mensagens úteis sem expor detalhes internos. */
export function describeDbError(error: PgLikeError | null | undefined, fallback = "Não foi possível concluir a operação."): string {
  if (!error) return fallback;
  if (error.hint?.startsWith("plan_limit:") || error.message?.startsWith("Limite do plano")) {
    return `${error.message}. Revise seu plano em Plano e uso.`;
  }
  switch (error.code) {
    case "23505":
      return "Já existe um registro com esses dados (duplicidade).";
    case "23503":
      return "Referência inválida: o registro relacionado não existe ou pertence a outra empresa.";
    case "23514":
      return "Os dados não atendem às regras de validação.";
    case "42501":
      return "Você não tem permissão para esta operação.";
    case "P0001":
      return error.message ?? fallback;
    default:
      return fallback;
  }
}
