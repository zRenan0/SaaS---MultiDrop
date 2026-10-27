import "server-only";
import { notFound } from "next/navigation";
import { AuthorizationError } from "@/server/errors";
import { getUser, isPlatformAdmin, type SessionUser } from "@/server/session";

/** Páginas do operador: usuários comuns recebem 404 (a rota não revela sua existência). */
export async function requirePlatformAdminPage(): Promise<SessionUser> {
  const user = await getUser();
  if (!user || !(await isPlatformAdmin())) notFound();
  return user;
}

export async function requirePlatformAdmin(): Promise<SessionUser> {
  const user = await getUser();
  if (!user || !(await isPlatformAdmin())) throw new AuthorizationError();
  return user;
}
