import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { can, hasRole, type Permission, type Role } from "@/features/organizations/roles";
import { AuthorizationError } from "@/server/errors";

export const ACTIVE_ORG_COOKIE = "active_org";

export type SessionUser = { id: string; email: string };
export type Membership = { organizationId: string; name: string; slug: string; role: Role };
export type OrgContext = {
  user: SessionUser;
  organization: { id: string; name: string; slug: string };
  role: Role;
  memberships: Membership[];
};

/** Usuário autenticado, validado pelo servidor de autenticação (não confia apenas no cookie). */
export const getUser = cache(async (): Promise<SessionUser | null> => {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return null;
  return { id: data.user.id, email: data.user.email ?? "" };
});

export async function requireUser(): Promise<SessionUser> {
  const user = await getUser();
  if (!user) redirect("/login");
  return user;
}

/** Associações reais do usuário, consultadas no banco (RLS). Nunca usa metadados editáveis. */
export const getMemberships = cache(async (userId: string): Promise<Membership[]> => {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("organization_members")
    .select("role, organization:organizations!inner(id, name, slug, status)")
    .eq("user_id", userId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? [])
    .filter((row) => row.organization.status === "active")
    .map((row) => ({
      organizationId: row.organization.id,
      name: row.organization.name,
      slug: row.organization.slug,
      role: row.role,
    }));
});

/**
 * Organização ativa validada no servidor. O cookie é apenas uma preferência:
 * se o usuário não for membro da organização indicada, usa a primeira associação válida.
 */
export const getOrgContext = cache(async (): Promise<OrgContext | null> => {
  const user = await getUser();
  if (!user) return null;
  const memberships = await getMemberships(user.id);
  if (memberships.length === 0) return null;
  const preferred = (await cookies()).get(ACTIVE_ORG_COOKIE)?.value;
  const active = memberships.find((m) => m.organizationId === preferred) ?? memberships[0];
  return {
    user,
    organization: { id: active.organizationId, name: active.name, slug: active.slug },
    role: active.role,
    memberships,
  };
});

/** Para páginas: redireciona ao login/onboarding quando necessário. */
export async function requireOrgContext(): Promise<OrgContext> {
  await requireUser();
  const ctx = await getOrgContext();
  if (!ctx) redirect("/app/onboarding");
  return ctx;
}

/** Para ações: exige papel mínimo na organização ativa. */
export async function requireRole(minimum: Role): Promise<OrgContext> {
  const ctx = await getOrgContext();
  if (!ctx) throw new AuthorizationError("Sessão expirada ou sem organização ativa.");
  if (!hasRole(ctx.role, minimum)) throw new AuthorizationError();
  return ctx;
}

export async function requirePermission(permission: Permission): Promise<OrgContext> {
  const ctx = await getOrgContext();
  if (!ctx) throw new AuthorizationError("Sessão expirada ou sem organização ativa.");
  if (!can(ctx.role, permission)) throw new AuthorizationError();
  return ctx;
}

export const isPlatformAdmin = cache(async (): Promise<boolean> => {
  const user = await getUser();
  if (!user) return false;
  const supabase = await createClient();
  const { data } = await supabase.from("platform_admins").select("user_id").eq("user_id", user.id).maybeSingle();
  return Boolean(data);
});
