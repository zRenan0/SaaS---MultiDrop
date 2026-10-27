export const ROLES = ["owner", "admin", "operator", "viewer"] as const;
export type Role = (typeof ROLES)[number];

const RANK: Record<Role, number> = { owner: 4, admin: 3, operator: 2, viewer: 1 };

export const ROLE_LABELS: Record<Role, string> = {
  owner: "Proprietário",
  admin: "Administrador",
  operator: "Operador",
  viewer: "Leitura",
};

export function hasRole(role: Role | null | undefined, minimum: Role): boolean {
  if (!role) return false;
  return RANK[role] >= RANK[minimum];
}

/** Permissões por ação. Espelham as políticas RLS; o banco é a fonte final de verdade. */
export const PERMISSIONS = {
  "organization.update": "admin",
  "members.manage": "admin",
  "billing.view": "viewer",
  "billing.manage": "owner",
  "suppliers.manage": "admin",
  "catalog.write": "operator",
  "catalog.delete": "admin",
  "imports.run": "operator",
  "pricing.configure": "admin",
  "pricing.simulate": "operator",
  "marketplace.connect": "admin",
  "listings.write": "operator",
  "listings.publish": "admin",
  "orders.forward": "operator",
  "operations.retry": "admin",
  "audit.view": "admin",
} as const satisfies Record<string, Role>;

export type Permission = keyof typeof PERMISSIONS;

export function can(role: Role | null | undefined, permission: Permission): boolean {
  return hasRole(role, PERMISSIONS[permission]);
}

/** Papéis que um membro com `actor` pode atribuir. Owner nunca é atribuído por convite ou edição. */
export function assignableRoles(actor: Role): Role[] {
  if (!hasRole(actor, "admin")) return [];
  return ["admin", "operator", "viewer"];
}
