import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { decryptSecret, encryptSecret, parseKeyRing, pkceChallenge } from "@/lib/security/crypto";

const k1 = randomBytes(32).toString("base64");
const k2 = randomBytes(32).toString("base64");

describe("criptografia de tokens", () => {
  it("cifra e decifra com a chave ativa", () => {
    const ring = parseKeyRing(`1:${k1}`, "1");
    const { ciphertext, keyVersion } = encryptSecret("APP_USR-segredo", "account:a", ring);
    expect(keyVersion).toBe(1);
    expect(ciphertext).not.toContain("segredo");
    expect(decryptSecret(ciphertext, "account:a", ring)).toBe("APP_USR-segredo");
  });

  it("falha se o contexto (AAD) for outro: token não pode ser movido entre contas", () => {
    const ring = parseKeyRing(`1:${k1}`, "1");
    const { ciphertext } = encryptSecret("x", "account:a", ring);
    expect(() => decryptSecret(ciphertext, "account:b", ring)).toThrow();
  });

  it("detecta adulteração", () => {
    const ring = parseKeyRing(`1:${k1}`, "1");
    const { ciphertext } = encryptSecret("valor", "ctx", ring);
    const parts = ciphertext.split(".");
    parts[3] = Buffer.from("outro").toString("base64url");
    expect(() => decryptSecret(parts.join("."), "ctx", ring)).toThrow();
  });

  it("suporta rotação: decifra versão antiga e cifra com a nova", () => {
    const old = parseKeyRing(`1:${k1}`, "1");
    const { ciphertext } = encryptSecret("antigo", "ctx", old);
    const rotated = parseKeyRing(`1:${k1},2:${k2}`, "2");
    expect(decryptSecret(ciphertext, "ctx", rotated)).toBe("antigo");
    expect(encryptSecret("novo", "ctx", rotated).ciphertext.startsWith("v2.")).toBe(true);
  });

  it("rejeita configuração inválida", () => {
    expect(() => parseKeyRing(undefined, undefined)).toThrow(/TOKEN_ENCRYPTION_KEYS/);
    expect(() => parseKeyRing("1:curta", "1")).toThrow(/32 bytes/);
    expect(() => parseKeyRing(`1:${k1}`, "3")).toThrow();
  });

  it("gera code_challenge PKCE S256 conforme RFC 7636", () => {
    // Vetor de teste do apêndice B da RFC 7636.
    expect(pkceChallenge("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk")).toBe("E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM");
  });
});
