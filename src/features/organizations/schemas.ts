import { z } from "zod";
import { emailSchema } from "@/features/auth/schemas";

export function slugify(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48)
    .replace(/-+$/g, "");
}

export const slugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9](?:[a-z0-9-]{1,46}[a-z0-9])$/, "Use de 3 a 48 caracteres: letras minúsculas, números e hífen.");

export const createOrganizationSchema = z.object({
  name: z.string().trim().min(2, "Informe o nome da empresa.").max(120),
  slug: slugSchema,
});

export const updateOrganizationSchema = z.object({ name: z.string().trim().min(2).max(120) });

export const inviteMemberSchema = z.object({
  email: emailSchema,
  role: z.enum(["admin", "operator", "viewer"], "Selecione um papel válido."),
});

export const updateMemberRoleSchema = z.object({
  memberId: z.uuid(),
  role: z.enum(["admin", "operator", "viewer"]),
});

export const uuidSchema = z.uuid("Identificador inválido.");
