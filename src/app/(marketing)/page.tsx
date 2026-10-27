import Link from "next/link";
import { ArrowRight, Boxes, Calculator, PackageSearch, ShieldCheck, ShoppingCart, Truck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { appConfig } from "@/lib/app-config";

const features = [
  { icon: PackageSearch, title: "Catálogo multifornecedor", text: "Cadastro manual, importação de CSV/Excel e adaptadores para APIs de fornecedores." },
  { icon: Calculator, title: "Lucro com composição real", text: "Custos, tarifas com fonte e data, impostos estimados, reserva e preço mínimo sem prejuízo." },
  { icon: ShoppingCart, title: "Mercado Livre pela API oficial", text: "Conexão OAuth, rascunho, validação e publicação com confirmação explícita." },
  { icon: Truck, title: "Pedidos encaminhados ao fornecedor", text: "Notificações de venda, deduplicação e acompanhamento do pedido de compra e do envio." },
  { icon: ShieldCheck, title: "Isolamento entre empresas", text: "Cada empresa em ambiente lógico próprio, com papéis e políticas no banco." },
];

export default function HomePage() {
  return (
    <div className="flex min-h-svh flex-col">
      <header className="border-b">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
          <span className="flex items-center gap-2 font-semibold">
            <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <Boxes className="size-4" aria-hidden />
            </span>
            {appConfig.name}
          </span>
          <nav className="flex items-center gap-2">
            <Button variant="ghost" asChild>
              <Link href="/login">Entrar</Link>
            </Button>
            <Button asChild>
              <Link href="/signup">Criar conta</Link>
            </Button>
          </nav>
        </div>
      </header>
      <main className="flex-1">
        <section className="mx-auto max-w-6xl px-4 py-16 sm:py-24">
          <h1 className="max-w-3xl text-3xl font-semibold tracking-tight sm:text-5xl">
            Venda no Mercado Livre com produtos de vários fornecedores, sem manter estoque próprio.
          </h1>
          <p className="mt-4 max-w-2xl text-lg text-muted-foreground">
            Organize o catálogo, calcule o lucro de cada venda, publique pela API oficial e encaminhe os pedidos aos
            fornecedores que despacham diretamente ao comprador, quando esse acordo existir.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Button size="lg" asChild>
              <Link href="/signup">
                Começar <ArrowRight aria-hidden />
              </Link>
            </Button>
            <Button size="lg" variant="outline" asChild>
              <Link href="/login">Já tenho conta</Link>
            </Button>
          </div>
        </section>
        <section className="mx-auto grid max-w-6xl gap-4 px-4 pb-20 sm:grid-cols-2 lg:grid-cols-3">
          {features.map(({ icon: Icon, title, text }) => (
            <div key={title} className="rounded-xl border bg-card p-5">
              <Icon className="size-5 text-primary" aria-hidden />
              <h2 className="mt-3 font-medium">{title}</h2>
              <p className="mt-1 text-sm text-muted-foreground">{text}</p>
            </div>
          ))}
        </section>
      </main>
      <footer className="border-t">
        <div className="mx-auto flex max-w-6xl flex-wrap gap-4 px-4 py-6 text-sm text-muted-foreground">
          <Link href="/legal/termos" className="hover:underline">Termos de uso</Link>
          <Link href="/legal/privacidade" className="hover:underline">Privacidade</Link>
          <span>Não somos afiliados ao Mercado Livre.</span>
        </div>
      </footer>
    </div>
  );
}
