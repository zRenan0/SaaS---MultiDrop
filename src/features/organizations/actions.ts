"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { randomToken, sha256Hex } from "@/lib/security/crypto";
import { appConfig } from "@/lib/app-config";
import { formDataToObject, parseInput, runAction } from "@/server/action";
import { audit } from "@/server/audit";
import { describeDbError, type ActionResult } from "@/server/errors";
import { ACTIVE_ORG_COOKIE, getMemberships, requirePermission, requireUser } from "@/server/session";
import {
  createOrganizationSchema,
  inviteMemberSchema,
  updateMemberRoleSchema,
  updateOrganizationSchema,
  uuidSchema,
} from "@/features/organizations/schemas";

async function setActiveOrgCookie(organizationId: string) {
  (await cookies()).set(ACTIVE_ORG_COOKIE, organizationId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
}

export async function createOrganizationAction(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  let createdId: string | null = null;
  const result = await runAction("organizations.create", async () => {
    const user = await requireUser();
    const input = parseInput(createOrganizationSchema, formDataToObject(formData));
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("create_organization", { org_name: input.name, org_slug: input.slug });
    if (error) {
      if (error.code === "23505") return { ok: false, error: "Este identificador já está em uso.", fieldErrors: { slug: ["Já em uso."] } };
      return { ok: false, error: describeDbError(error) };
    }
    createdId = data;
    await audit({ organizationId: data, actorUserId: user.id, action: "organization.create", entityType: "organization", entityId: data });
    return { ok: true };
  });
  if (result.ok && createdId) {
    await setActiveOrgCookie(createdId);
    redirect("/app");
  }
  return result;
}

export async function switchOrganizationAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const organizationId = uuidSchema.safeParse(formData.get("organizationId"));
  if (!organizationId.success) return;
  // Só aceita organizações às quais o usuário realmente pertence.
  const memberships = await getMemberships(user.id);
  if (!memberships.some((m) => m.organizationId === organizationId.data)) return;
  await setActiveOrgCookie(organizationId.data);
  redirect("/app");
}

export async function updateOrganizationAction(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  return runAction("organizations.update", async () => {
    const ctx = await requirePermission("organization.update");
    const input = parseInput(updateOrganizationSchema, formDataToObject(formData));
    const supabase = await createClient();
    const { error } = await supabase.from("organizations").update({ name: input.name }).eq("id", ctx.organization.id);
    if (error) return { ok: false, error: describeDbError(error) };
    await audit({ organizationId: ctx.organization.id, actorUserId: ctx.user.id, action: "organization.update", entityType: "organization", entityId: ctx.organization.id, metadata: { name: input.name } });
    revalidatePath("/app", "layout");
    return { ok: true, message: "Dados da empresa atualizados." };
  });
}

export async function inviteMemberAction(_prev: ActionResult<{ inviteUrl: string }> | null, formData: FormData): Promise<ActionResult<{ inviteUrl: string }>> {
  return runAction("organizations.invite", async () => {
    const ctx = await requirePermission("members.manage");
    const input = parseInput(inviteMemberSchema, formDataToObject(formData));
    const token = randomToken(32);
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("organization_invitations")
      .insert({
        organization_id: ctx.organization.id,
        email: input.email,
        role: input.role,
        token_hash: sha256Hex(token),
        invited_by: ctx.user.id,
        expires_at: new Date(Date.now() + 7 * 86400_000).toISOString(),
      })
      .select("id")
      .single();
    if (error) {
      if (error.code === "23505") return { ok: false, error: "Já existe um convite pendente para este e-mail." };
      return { ok: false, error: describeDbError(error) };
    }
    await audit({ organizationId: ctx.organization.id, actorUserId: ctx.user.id, action: "invitation.create", entityType: "organization_invitation", entityId: data.id, metadata: { email: input.email, role: input.role } });
    revalidatePath("/app/settings");
    // O envio de e-mail transacional não está configurado: o link é exibido uma única vez para compartilhamento.
    return {
      ok: true,
      message: "Convite criado. Copie o link abaixo e envie ao convidado (ele não será exibido novamente).",
      data: { inviteUrl: `${appConfig.url}/invite/${token}` },
    };
  });
}

export async function revokeInvitationAction(formData: FormData): Promise<ActionResult> {
  return runAction("organizations.revoke_invite", async () => {
    const ctx = await requirePermission("members.manage");
    const id = parseInput(uuidSchema, formData.get("invitationId"));
    const supabase = await createClient();
    const { error } = await supabase.from("organization_invitations").delete().eq("id", id).eq("organization_id", ctx.organization.id);
    if (error) return { ok: false, error: describeDbError(error) };
    await audit({ organizationId: ctx.organization.id, actorUserId: ctx.user.id, action: "invitation.revoke", entityType: "organization_invitation", entityId: id });
    revalidatePath("/app/settings");
    return { ok: true, message: "Convite revogado." };
  });
}

export async function updateMemberRoleAction(formData: FormData): Promise<ActionResult> {
  return runAction("organizations.update_role", async () => {
    const ctx = await requirePermission("members.manage");
    const input = parseInput(updateMemberRoleSchema, formDataToObject(formData));
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("organization_members")
      .update({ role: input.role })
      .eq("id", input.memberId)
      .eq("organization_id", ctx.organization.id)
      .select("id");
    if (error) return { ok: false, error: describeDbError(error) };
    if (!data?.length) return { ok: false, error: "Membro não encontrado ou sem permissão (owners não podem ser alterados)." };
    revalidatePath("/app/settings");
    return { ok: true, message: "Papel atualizado." };
  });
}

export async function removeMemberAction(formData: FormData): Promise<ActionResult> {
  return runAction("organizations.remove_member", async () => {
    const ctx = await requirePermission("members.manage");
    const memberId = parseInput(uuidSchema, formData.get("memberId"));
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("organization_members")
      .delete()
      .eq("id", memberId)
      .eq("organization_id", ctx.organization.id)
      .select("id");
    if (error) return { ok: false, error: describeDbError(error) };
    if (!data?.length) return { ok: false, error: "Membro não encontrado ou não pode ser removido." };
    revalidatePath("/app/settings");
    return { ok: true, message: "Membro removido." };
  });
}

export async function acceptInvitationAction(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  let orgId: string | null = null;
  const result = await runAction("organizations.accept_invite", async () => {
    await requireUser();
    const token = String(formData.get("token") ?? "");
    if (token.length < 20 || token.length > 100) return { ok: false, error: "Convite inválido." };
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("accept_invitation", { invite_token: token });
    if (error) {
      return { ok: false, error: error.code === "42501" ? "Este convite foi emitido para outro e-mail. Entre com a conta convidada." : "Convite inválido ou expirado." };
    }
    orgId = data;
    return { ok: true };
  });
  if (result.ok && orgId) {
    await setActiveOrgCookie(orgId);
    redirect("/app");
  }
  return result;
}
