/** Normalização determinística de dados de catálogo (usada em deduplicação e busca). */

export function normalizeText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

export function normalizeTitle(title: string): string {
  return normalizeText(title).slice(0, 255);
}

export function normalizeSku(sku: string): string {
  return sku.trim().replace(/\s+/g, "").toUpperCase();
}

/** Valida GTIN-8/12/13/14 pelo dígito verificador (GS1). */
export function isValidGtin(raw: string): boolean {
  const gtin = raw.replace(/\D/g, "");
  if (![8, 12, 13, 14].includes(gtin.length) || gtin !== raw.trim()) return false;
  const digits = gtin.split("").map(Number);
  const check = digits.pop()!;
  const total = digits
    .reverse()
    .reduce((acc, digit, index) => acc + digit * (index % 2 === 0 ? 3 : 1), 0);
  return (10 - (total % 10)) % 10 === check;
}

const PRIVATE_HOST = /^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|169\.254\.|0\.|\[?::1\]?|\[?fc|\[?fd|metadata\.google\.internal)/i;

/** Aceita apenas URLs https públicas (sem hosts internos), sem credenciais embutidas. */
export function isSafePublicUrl(value: string): boolean {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  if (url.protocol !== "https:" || url.username || url.password) return false;
  if (PRIVATE_HOST.test(url.hostname) || !url.hostname.includes(".")) return false;
  return value.length <= 2000;
}

/** Detecta conteúdo que planilhas interpretam como fórmula (CSV/Excel injection) ou caracteres de controle. */
export function isDangerousCell(value: string): boolean {
  return /^[=+@\t\r]/.test(value) || /^-[^\d\s.,]/.test(value) || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value);
}

/** Chave usada para detectar produtos equivalentes sem GTIN (mesma marca, modelo e título normalizados). */
export function productFingerprint(input: { title: string; brand?: string | null; model?: string | null }): string {
  return [normalizeText(input.brand ?? ""), normalizeText(input.model ?? ""), normalizeTitle(input.title)].join("|");
}
