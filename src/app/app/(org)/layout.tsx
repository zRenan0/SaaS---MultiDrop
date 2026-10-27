import Link from "next/link";
import { Boxes, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { SidebarNav } from "@/components/layout/sidebar-nav";
import { MobileNav } from "@/components/layout/mobile-nav";
import { OrgSwitcher } from "@/components/layout/org-switcher";
import { UserMenu } from "@/components/layout/user-menu";
import { appConfig } from "@/lib/app-config";
import { isPlatformAdmin, requireOrgContext } from "@/server/session";

export default async function OrgLayout({ children }: LayoutProps<"/app">) {
  const ctx = await requireOrgContext();
  const admin = await isPlatformAdmin();
  return (
    <div className="flex min-h-svh">
      <aside className="hidden w-64 shrink-0 flex-col gap-4 border-r bg-sidebar p-4 lg:flex">
        <Link href="/app" className="flex items-center gap-2 px-1 font-semibold">
          <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Boxes className="size-4" aria-hidden />
          </span>
          {appConfig.name}
        </Link>
        <OrgSwitcher activeId={ctx.organization.id} memberships={ctx.memberships} />
        <SidebarNav />
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex h-14 items-center gap-2 border-b bg-background/95 px-4 backdrop-blur">
          <MobileNav appName={appConfig.name} />
          <form action="/app/products" role="search" className="relative max-w-md flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <label htmlFor="global-search" className="sr-only">Pesquisar produtos</label>
            <Input id="global-search" name="q" placeholder="Pesquisar produtos, SKU ou marca" className="pl-8" />
          </form>
          <div className="ml-auto flex items-center gap-2">
            <span className="hidden truncate text-sm text-muted-foreground sm:block lg:hidden">{ctx.organization.name}</span>
            <UserMenu email={ctx.user.email} isAdmin={admin} />
          </div>
        </header>
        <div className="border-b p-3 lg:hidden">
          <OrgSwitcher activeId={ctx.organization.id} memberships={ctx.memberships} />
        </div>
        <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8">{children}</main>
      </div>
    </div>
  );
}
