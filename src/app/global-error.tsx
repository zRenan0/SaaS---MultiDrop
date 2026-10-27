"use client";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="pt-BR">
      <body style={{ fontFamily: "system-ui, sans-serif", padding: 32 }}>
        <h1>Erro inesperado</h1>
        <p>Recarregue a página. Código para o suporte: {error.digest ?? "indisponível"}.</p>
        <button onClick={reset}>Tentar novamente</button>
      </body>
    </html>
  );
}
