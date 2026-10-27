import "server-only";
import { createCipheriv, createDecipheriv, createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { MissingConfigurationError } from "@/lib/env";

/**
 * Criptografia de segredos em repouso (AES-256-GCM) com chaves versionadas fora do banco.
 * Formato do texto cifrado: "v<versão>.<iv>.<tag>.<dados>" (base64url).
 * O "context" entra como AAD: um token cifrado para uma conta não decifra se for copiado para outra.
 */

type KeyRing = { active: number; keys: Map<number, Buffer> };

export function parseKeyRing(raw: string | undefined, activeRaw: string | undefined): KeyRing {
  if (!raw) throw new MissingConfigurationError(["TOKEN_ENCRYPTION_KEYS"]);
  const keys = new Map<number, Buffer>();
  for (const entry of raw.split(",").map((s) => s.trim()).filter(Boolean)) {
    const [versionText, material] = entry.split(":");
    const version = Number(versionText);
    if (!Number.isInteger(version) || version < 1 || !material) {
      throw new Error("TOKEN_ENCRYPTION_KEYS em formato inválido (esperado versão:base64)");
    }
    const key = Buffer.from(material, "base64");
    if (key.length !== 32) throw new Error(`Chave de criptografia v${version} deve ter 32 bytes`);
    keys.set(version, key);
  }
  const active = Number(activeRaw ?? Math.max(...keys.keys()));
  if (!keys.has(active)) throw new Error("TOKEN_ENCRYPTION_ACTIVE_VERSION não corresponde a nenhuma chave");
  return { active, keys };
}

function keyRing(): KeyRing {
  return parseKeyRing(process.env.TOKEN_ENCRYPTION_KEYS, process.env.TOKEN_ENCRYPTION_ACTIVE_VERSION);
}

export function encryptSecret(plaintext: string, context: string, ring: KeyRing = keyRing()) {
  const key = ring.keys.get(ring.active)!;
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(Buffer.from(context, "utf8"));
  const data = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    ciphertext: `v${ring.active}.${iv.toString("base64url")}.${tag.toString("base64url")}.${data.toString("base64url")}`,
    keyVersion: ring.active,
  };
}

export function decryptSecret(ciphertext: string, context: string, ring: KeyRing = keyRing()): string {
  const parts = ciphertext.split(".");
  if (parts.length !== 4 || !parts[0].startsWith("v")) throw new Error("Segredo cifrado em formato inválido");
  const version = Number(parts[0].slice(1));
  const key = ring.keys.get(version);
  if (!key) throw new Error(`Chave de criptografia v${version} indisponível`);
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(parts[1], "base64url"));
  decipher.setAAD(Buffer.from(context, "utf8"));
  decipher.setAuthTag(Buffer.from(parts[2], "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(parts[3], "base64url")), decipher.final()]).toString("utf8");
}

export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

export function sha256Hex(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

export function pkceChallenge(verifier: string): string {
  return createHash("sha256").update(verifier).digest("base64url");
}

export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}
