import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main className="flex min-h-svh flex-col items-center justify-center gap-4 px-4 text-center">
      <p className="text-sm font-medium text-muted-foreground">404</p>
      <h1 className="text-2xl font-semibold">Página não encontrada</h1>
      <p className="max-w-md text-sm text-muted-foreground">O endereço não existe ou você não tem acesso a ele.</p>
      <Button asChild>
        <Link href="/app">Ir para o painel</Link>
      </Button>
    </main>
  );
}
