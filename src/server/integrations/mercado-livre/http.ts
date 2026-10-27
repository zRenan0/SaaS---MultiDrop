import { redactText } from "@/lib/logging/logger";

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export type MlErrorCause = { code?: string; message?: string; type?: string; department?: string; cause_id?: number };

/** Erro da API do Mercado Livre com classificação para retentativa. */
export class MlApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly causes: MlErrorCause[] = [],
    public readonly retryable = false,
  ) {
    super(redactText(message));
    this.name = "MlApiError";
  }

  get isAuthError() {
    return this.status === 401 || this.code === "invalid_grant" || this.code === "invalid_token";
  }
}

type RequestOptions = {
  method?: "GET" | "POST" | "PUT" | "DELETE";
  accessToken?: string;
  json?: unknown;
  form?: Record<string, string>;
  query?: Record<string, string | number | undefined>;
  /** Somente operações idempotentes devem ser repetidas automaticamente. */
  retry?: boolean;
  timeoutMs?: number;
};

export type HttpClientOptions = {
  baseUrl: string;
  fetchImpl?: FetchLike;
  maxAttempts?: number;
  baseDelayMs?: number;
  sleep?: (ms: number) => Promise<void>;
};

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export function backoffDelay(attempt: number, baseDelayMs: number, retryAfterHeader: string | null): number {
  const retryAfter = retryAfterHeader ? Number(retryAfterHeader) : NaN;
  if (Number.isFinite(retryAfter) && retryAfter >= 0) return Math.min(retryAfter * 1000, 60_000);
  const exponential = baseDelayMs * 2 ** (attempt - 1);
  return Math.min(exponential + Math.floor(Math.random() * baseDelayMs), 30_000);
}

async function toError(response: Response): Promise<MlApiError> {
  let body: { error?: string; message?: string; cause?: MlErrorCause[] | MlErrorCause } = {};
  try {
    body = (await response.json()) as typeof body;
  } catch {
    // Corpo não JSON: mantém apenas o status.
  }
  const causes = Array.isArray(body.cause) ? body.cause : body.cause ? [body.cause] : [];
  const retryable = response.status === 429 || response.status >= 500;
  return new MlApiError(response.status, body.error ?? `http_${response.status}`, body.message ?? `HTTP ${response.status}`, causes, retryable);
}

/** Cliente HTTP mínimo: timeout, retentativa com backoff exponencial (429/5xx/rede) e respeito a Retry-After. */
export class MlHttpClient {
  private readonly fetchImpl: FetchLike;
  private readonly maxAttempts: number;
  private readonly baseDelayMs: number;
  private readonly sleep: (ms: number) => Promise<void>;

  constructor(private readonly options: HttpClientOptions) {
    this.fetchImpl = options.fetchImpl ?? ((input, init) => fetch(input, init));
    this.maxAttempts = options.maxAttempts ?? 4;
    this.baseDelayMs = options.baseDelayMs ?? 500;
    this.sleep = options.sleep ?? defaultSleep;
  }

  async request<T>(path: string, opts: RequestOptions = {}): Promise<{ status: number; data: T }> {
    const url = new URL(path, this.options.baseUrl);
    for (const [k, v] of Object.entries(opts.query ?? {})) if (v !== undefined) url.searchParams.set(k, String(v));
    const headers: Record<string, string> = { Accept: "application/json" };
    if (opts.accessToken) headers.Authorization = `Bearer ${opts.accessToken}`;
    let body: string | undefined;
    if (opts.json !== undefined) {
      headers["Content-Type"] = "application/json";
      body = JSON.stringify(opts.json);
    } else if (opts.form) {
      headers["Content-Type"] = "application/x-www-form-urlencoded";
      body = new URLSearchParams(opts.form).toString();
    }
    const method = opts.method ?? "GET";
    const canRetry = opts.retry ?? method === "GET";
    const attempts = canRetry ? this.maxAttempts : 1;

    let lastError: MlApiError | null = null;
    for (let attempt = 1; attempt <= attempts; attempt++) {
      let response: Response;
      try {
        response = await this.fetchImpl(url.toString(), {
          method,
          headers,
          body,
          signal: AbortSignal.timeout(opts.timeoutMs ?? 15_000),
          cache: "no-store",
        });
      } catch (error) {
        lastError = new MlApiError(0, "network_error", error instanceof Error ? error.message : "falha de rede", [], true);
        if (attempt < attempts) await this.sleep(backoffDelay(attempt, this.baseDelayMs, null));
        continue;
      }
      if (response.ok) {
        if (response.status === 204) return { status: 204, data: null as T };
        const text = await response.text();
        return { status: response.status, data: (text ? JSON.parse(text) : null) as T };
      }
      lastError = await toError(response);
      if (!lastError.retryable || attempt === attempts) throw lastError;
      await this.sleep(backoffDelay(attempt, this.baseDelayMs, response.headers.get("retry-after")));
    }
    throw lastError ?? new MlApiError(0, "unknown", "falha desconhecida");
  }
}
