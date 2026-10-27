import { describe, expect, it } from "vitest";
import { safeNextPath, signUpSchema } from "@/features/auth/schemas";
import { createOrganizationSchema, slugify } from "@/features/organizations/schemas";
import { redact, redactText } from "@/lib/logging/logger";

describe("autenticação", () => {
  it("bloqueia open redirect", () => {
    expect(safeNextPath("/app/products")).toBe("/app/products");
    expect(safeNextPath("https://evil.com")).toBe("/app");
    expect(safeNextPath("//evil.com")).toBe("/app");
    expect(safeNextPath("/\\evil.com")).toBe("/app");
    expect(safeNextPath(null)).toBe("/app");
  });

  it("exige senha com tamanho mínimo, letras e números", () => {
    expect(signUpSchema.safeParse({ fullName: "Ana", email: "a@b.com", password: "curta1" }).success).toBe(false);
    expect(signUpSchema.safeParse({ fullName: "Ana", email: "a@b.com", password: "somenteletras" }).success).toBe(false);
    expect(signUpSchema.safeParse({ fullName: "Ana", email: "A@B.com", password: "boaSenha123" }).data?.email).toBe("a@b.com");
  });
});

describe("organizações", () => {
  it("gera slug válido a partir do nome", () => {
    expect(slugify("Loja do João & Cia Ltda.")).toBe("loja-do-joao-cia-ltda");
    expect(createOrganizationSchema.safeParse({ name: "Loja", slug: slugify("Ação Ótima") }).success).toBe(true);
    expect(createOrganizationSchema.safeParse({ name: "Loja", slug: "-x" }).success).toBe(false);
  });
});

describe("logs", () => {
  it("remove credenciais de objetos e textos", () => {
    expect(redact({ access_token: "abc", nested: { refresh_token: "x", ok: 1 } })).toEqual({
      access_token: "[removido]",
      nested: { refresh_token: "[removido]", ok: 1 },
    });
    expect(redactText("falha com APP_USR-123-abc e Bearer xyz.abc")).toBe("falha com APP_USR-[removido] e Bearer [removido]");
  });
});
