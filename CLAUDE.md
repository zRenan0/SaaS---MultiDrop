# CLAUDE.md

Regras permanentes deste repositório. Leia também `AGENTS.md` (regras do Next.js 16, gerado pelo framework).

## Produto
SaaS multiempresa para vender no Mercado Livre com produtos de vários fornecedores (dropshipping quando houver acordo).
Documentação em `docs/`. Progresso e próxima tarefa: `docs/progress.md`. Decisões: `docs/decisions.md`.

## Stack
Next.js 16 (App Router, `src/`, `proxy.ts` no lugar de middleware, `cacheComponents` desligado), React 19, TypeScript estrito,
Tailwind 4, shadcn/ui (radix), Supabase (Auth + Postgres + RLS), Zod 4, decimal.js, Vitest, Playwright, pgTAP. Gerenciador: pnpm.

## Comandos
- `pnpm db:start` sobe Supabase local (Docker). `pnpm db:reset` reaplica migrações. `pnpm db:types` regenera `src/types/database.ts`.
- `pnpm dev`, `pnpm typecheck`, `pnpm lint`, `pnpm test` (unit), `pnpm test:db` (pgTAP), `pnpm test:integration`, `pnpm test:e2e`.
- `pnpm test:all` roda tudo. Rode antes de cada commit relevante.
- E2E sobe Next.js isolado na porta 3100 (`.next-e2e`) e o Mercado Livre SIMULADO na 4010 (`tests/mocks`). Nunca trate esses testes como prova de integração real.

## Regras de código
- Organização por domínio em `src/features/<domínio>`; integrações externas em `src/server/integrations`; UI genérica em `src/components`.
- Regra de negócio nunca dentro de componente React. Cálculos monetários só com `src/lib/money` (decimal), nunca `number` float.
- Toda entrada externa validada com Zod (`parseInput`). Server Actions envolvidas em `runAction`.
- Autorização no servidor: `requireRole`/`requirePermission` + RLS. Organização ativa vem de `getOrgContext()` (validada no banco).
- `createAdminClient()` (service role) somente em processos do sistema (webhooks, fila, OAuth, cobrança, admin) e após checagem explícita.
- Nunca usar `user_metadata` para autorização. Nunca expor segredos em `NEXT_PUBLIC_*`, logs, URLs ou respostas.
- Tokens de terceiros cifrados com `encryptSecret` (AES-256-GCM, AAD = contexto do registro), guardados no schema `private`.
- Proibido: `any`, `catch {}` silencioso sem justificativa, desligar lint/RLS para passar teste, dados fictícios apresentados como reais.
- Operações externas reais (publicar anúncio, cobrar, comprar do fornecedor) exigem integração validada e confirmação explícita.

## Banco
- Migrações em `supabase/migrations` (nunca editar migração já aplicada em produção; criar nova).
- Tabela de tenant: `organization_id NOT NULL`, `UNIQUE (organization_id, id)`, FKs compostas, trigger `prevent_organization_change`,
  RLS por operação com `private.org_ids_with_role(...)`, grants de coluna explícitos. Testes pgTAP em `supabase/tests/database`.
- Após mudar o schema: `pnpm db:reset && pnpm db:types && pnpm test:db`.

## Idioma
Interface, mensagens e documentação em português do Brasil; valores em BRL; datas exibidas em America/Sao_Paulo.
