import Link from "next/link";
import { Shield } from "lucide-react";
import { requirePlatformAdminPage } from "@/features/admin/guard";
import { appConfig } from "@/lib/app-config";

export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  const user = await requirePlatformAdminPage();
  return (
    <div className="min-h-svh">
      <header className="border-b bg-sidebar">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-4 px-4">
          <span className="flex items-center gap-2 font-semibold">
            <Shield className="size-4" aria-hidden /> {appConfig.name} · Operador
          </span>
          <nav className="flex gap-3 text-sm" aria-label="Painel do operador">
            <Link href="/admin" className="hover:underline">Visão geral</Link>
            <Link href="/admin/organizations" className="hover:underline">Empresas</Link>
            <Link href="/app" className="text-muted-foreground hover:underline">Voltar ao painel</Link>
          </nav>
          <span className="ml-auto truncate text-xs text-muted-foreground">{user.email}</span>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
    </div>
  );
}
