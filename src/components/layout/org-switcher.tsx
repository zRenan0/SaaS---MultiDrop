import { Building2, Check, ChevronsUpDown, Plus } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { switchOrganizationAction } from "@/features/organizations/actions";
import { ROLE_LABELS } from "@/features/organizations/roles";
import type { Membership } from "@/server/session";

export function OrgSwitcher({ activeId, memberships }: { activeId: string; memberships: Membership[] }) {
  const active = memberships.find((m) => m.organizationId === activeId);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" className="h-auto w-full justify-between px-3 py-2" aria-label="Trocar de empresa">
          <span className="flex min-w-0 items-center gap-2">
            <Building2 className="size-4 shrink-0" aria-hidden />
            <span className="min-w-0 text-left">
              <span className="block truncate text-sm font-medium">{active?.name}</span>
              <span className="block text-xs text-muted-foreground">{active ? ROLE_LABELS[active.role] : ""}</span>
            </span>
          </span>
          <ChevronsUpDown className="size-4 opacity-60" aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-64" align="start">
        <DropdownMenuLabel>Empresas</DropdownMenuLabel>
        {memberships.map((m) => (
          <form key={m.organizationId} action={switchOrganizationAction}>
            <input type="hidden" name="organizationId" value={m.organizationId} />
            <DropdownMenuItem asChild>
              <button type="submit" className="flex w-full items-center justify-between">
                <span className="truncate">{m.name}</span>
                {m.organizationId === activeId ? <Check className="size-4" aria-label="Ativa" /> : null}
              </button>
            </DropdownMenuItem>
          </form>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/app/onboarding">
            <Plus className="size-4" aria-hidden /> Nova empresa
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
