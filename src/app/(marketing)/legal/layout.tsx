import Link from "next/link";

export default function LegalLayout({ children }: LayoutProps<"/legal">) {
  return (
    <div className="mx-auto max-w-3xl px-4 py-12">
      <Link href="/" className="text-sm text-muted-foreground hover:underline">← Início</Link>
      <article className="prose-sm mt-6 space-y-4 [&_h1]:text-2xl [&_h1]:font-semibold [&_h2]:mt-6 [&_h2]:text-lg [&_h2]:font-medium [&_p]:text-muted-foreground [&_li]:text-muted-foreground [&_ul]:list-disc [&_ul]:pl-5">
        <p className="rounded-md border border-warning/50 bg-warning/10 p-3 text-sm text-foreground">
          Documento-base em elaboração. Não substitui revisão jurídica e precisa ser validado antes do uso comercial.
        </p>
        {children}
      </article>
    </div>
  );
}
