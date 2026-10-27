import { describe, expect, it } from "vitest";
import { assignableRoles, can, hasRole, PERMISSIONS } from "@/features/organizations/roles";

describe("papéis e permissões", () => {
  it("respeita a hierarquia owner > admin > operator > viewer", () => {
    expect(hasRole("owner", "admin")).toBe(true);
    expect(hasRole("admin", "admin")).toBe(true);
    expect(hasRole("operator", "admin")).toBe(false);
    expect(hasRole("viewer", "operator")).toBe(false);
    expect(hasRole(null, "viewer")).toBe(false);
  });

  it("viewer não escreve; operator opera; admin configura; owner gerencia cobrança", () => {
    expect(can("viewer", "catalog.write")).toBe(false);
    expect(can("operator", "catalog.write")).toBe(true);
    expect(can("operator", "catalog.delete")).toBe(false);
    expect(can("operator", "listings.publish")).toBe(false);
    expect(can("admin", "listings.publish")).toBe(true);
    expect(can("admin", "billing.manage")).toBe(false);
    expect(can("owner", "billing.manage")).toBe(true);
  });

  it("ninguém atribui o papel owner por convite ou edição", () => {
    expect(assignableRoles("owner")).not.toContain("owner");
    expect(assignableRoles("admin")).toEqual(["admin", "operator", "viewer"]);
    expect(assignableRoles("operator")).toEqual([]);
  });

  it("toda permissão tem papel mínimo válido", () => {
    for (const role of Object.values(PERMISSIONS)) expect(["owner", "admin", "operator", "viewer"]).toContain(role);
  });
});
