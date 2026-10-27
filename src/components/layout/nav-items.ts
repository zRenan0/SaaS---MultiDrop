import {
  Activity,
  Boxes,
  Calculator,
  CreditCard,
  FileSpreadsheet,
  LayoutDashboard,
  Megaphone,
  Plug,
  Settings,
  ShoppingCart,
  Truck,
  type LucideIcon,
} from "lucide-react";

export type NavItem = { href: string; label: string; icon: LucideIcon };
export type NavGroup = { label: string; items: NavItem[] };

export const NAV_GROUPS: NavGroup[] = [
  {
    label: "Operação",
    items: [
      { href: "/app", label: "Visão geral", icon: LayoutDashboard },
      { href: "/app/products", label: "Produtos e ofertas", icon: Boxes },
      { href: "/app/suppliers", label: "Fornecedores", icon: Truck },
      { href: "/app/imports", label: "Importações", icon: FileSpreadsheet },
      { href: "/app/pricing", label: "Precificação", icon: Calculator },
      { href: "/app/listings", label: "Anúncios", icon: Megaphone },
      { href: "/app/orders", label: "Pedidos", icon: ShoppingCart },
    ],
  },
  {
    label: "Conta",
    items: [
      { href: "/app/integrations", label: "Mercado Livre", icon: Plug },
      { href: "/app/operations", label: "Operações e erros", icon: Activity },
      { href: "/app/billing", label: "Plano e uso", icon: CreditCard },
      { href: "/app/settings", label: "Configurações", icon: Settings },
    ],
  },
];
