import "server-only";

/**
 * Logger estruturado (JSON) com remoção de campos sensíveis.
 * Nunca registre tokens, segredos, senhas ou dados pessoais desnecessários.
 */
const SENSITIVE_KEY = /(token|secret|password|authorization|cookie|code_verifier|api[_-]?key|credential|^code$)/i;
const MAX_DEPTH = 5;

export function redact(value: unknown, depth = 0): unknown {
  if (depth > MAX_DEPTH) return "[profundidade]";
  if (Array.isArray(value)) return value.slice(0, 50).map((v) => redact(v, depth + 1));
  if (value instanceof Error) return { name: value.name, message: redactText(value.message) };
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, v] of Object.entries(value)) {
      out[key] = SENSITIVE_KEY.test(key) ? "[removido]" : redact(v, depth + 1);
    }
    return out;
  }
  if (typeof value === "string") return redactText(value);
  return value;
}

/** Remove padrões de token conhecidos em textos livres (ex.: mensagens de erro). */
export function redactText(text: string): string {
  return text
    .replace(/APP_USR-[A-Za-z0-9-]+/g, "APP_USR-[removido]")
    .replace(/TG-[A-Za-z0-9-]+/g, "TG-[removido]")
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [removido]")
    .slice(0, 2000);
}

type Level = "debug" | "info" | "warn" | "error";

function write(level: Level, message: string, context?: Record<string, unknown>) {
  if (level === "debug" && process.env.NODE_ENV === "production") return;
  const line = JSON.stringify({ level, message, time: new Date().toISOString(), ...(redact(context ?? {}) as object) });
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

export const logger = {
  debug: (message: string, context?: Record<string, unknown>) => write("debug", message, context),
  info: (message: string, context?: Record<string, unknown>) => write("info", message, context),
  warn: (message: string, context?: Record<string, unknown>) => write("warn", message, context),
  error: (message: string, context?: Record<string, unknown>) => write("error", message, context),
};
