"use client";

import { useState } from "react";
import { FlaskConical, RefreshCw, Unplug } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ActionForm } from "@/components/forms/action-form";
import { createTestUserAction, disconnectAccountAction, syncAccountAction, type TestUserCredentials } from "@/features/marketplace/actions";

export function AccountActions({ accountId, nickname }: { accountId: string; nickname: string }) {
  return (
    <div className="flex flex-wrap gap-2">
      <ActionForm action={syncAccountAction}>
        <input type="hidden" name="accountId" value={accountId} />
        <Button type="submit" variant="outline" size="sm">
          <RefreshCw aria-hidden /> Consultar conta
        </Button>
      </ActionForm>
      <ActionForm
        action={disconnectAccountAction}
        confirm={{
          title: `Desconectar ${nickname}?`,
          description: "Os tokens serão apagados e a sincronização de anúncios e pedidos desta conta será interrompida.",
          confirmLabel: "Desconectar",
        }}
      >
        <input type="hidden" name="accountId" value={accountId} />
        <Button type="submit" variant="destructive" size="sm">
          <Unplug aria-hidden /> Desconectar
        </Button>
      </ActionForm>
    </div>
  );
}

/** Cria usuário de teste do Mercado Livre e mostra as credenciais uma única vez (não ficam gravadas). */
export function CreateTestUser({ accountId }: { accountId: string }) {
  const [created, setCreated] = useState<TestUserCredentials | null>(null);
  return (
    <div className="grid gap-2">
      <ActionForm
        action={createTestUserAction}
        onSuccess={(result) => {
          if (result.ok && result.data) setCreated(result.data as TestUserCredentials);
        }}
        confirm={{
          title: "Criar usuário de teste do Mercado Livre?",
          description:
            "O Mercado Livre cria uma conta de teste vinculada à sua aplicação (limite de 10 por conta). Anúncios e compras entre usuários de teste não envolvem dinheiro real. A senha aparece uma única vez.",
          confirmLabel: "Criar usuário de teste",
        }}
      >
        <input type="hidden" name="accountId" value={accountId} />
        <Button type="submit" variant="outline" size="sm">
          <FlaskConical aria-hidden /> Criar usuário de teste
        </Button>
      </ActionForm>
      {created ? (
        <div role="status" className="grid gap-1 rounded-md border border-warning/40 bg-warning/10 p-3">
          <p className="font-medium">Usuário de teste criado. Guarde estes dados agora; eles não serão exibidos de novo.</p>
          <dl className="grid gap-1 sm:grid-cols-[auto_1fr] sm:gap-x-4">
            <dt className="text-muted-foreground">ID</dt>
            <dd className="font-mono">{created.id}</dd>
            <dt className="text-muted-foreground">Usuário</dt>
            <dd className="font-mono">{created.nickname}</dd>
            {created.email ? (
              <>
                <dt className="text-muted-foreground">E-mail</dt>
                <dd className="font-mono">{created.email}</dd>
              </>
            ) : null}
            <dt className="text-muted-foreground">Senha</dt>
            <dd className="font-mono">{created.password}</dd>
          </dl>
          <p className="text-muted-foreground">
            Para conectar: saia da sua conta no Mercado Livre (ou use uma janela anônima), entre no site, crie uma empresa separada para testes e clique em Conectar conta usando este usuário.
          </p>
        </div>
      ) : null}
    </div>
  );
}
