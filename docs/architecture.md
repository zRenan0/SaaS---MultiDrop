# Arquitetura

## Visão geral
Monólito modular em Next.js (App Router) hospedado na Vercel, com Supabase (Postgres, Auth) como backend de dados.
Processamento assíncrono por fila durável em Postgres (`sync_jobs`), executada por rota protegida chamada pelo agendador (Vercel Cron) e
disparada também logo após eventos (webhooks). Não há microsserviços.

```
Navegador ──> Next.js (Server Components / Server Actions / Route Handlers)
                 │  cliente Supabase do usuário (RLS)            │ cliente service role (somente sistema)
                 ▼                                               ▼
             Postgres (Supabase) ── RLS por organização ── schema private (credenciais, estado OAuth, rate limit)
                 ▲
Mercado Livre ──> /api/webhooks/mercado-livre ──> webhook_events + sync_jobs ──> /api/jobs/run (cron) ──> API ML / fornecedores
```

## Camadas
| Camada | Local | Responsabilidade |
|---|---|---|
| Rotas e páginas | `src/app` | Renderização, composição de componentes, Route Handlers públicos (webhook, OAuth, cron) |
| UI | `src/components` | Componentes acessíveis reutilizáveis (shadcn/ui), layout, estados vazios/erro |
| Domínio | `src/features/<domínio>` | Schemas Zod, regras puras (cálculo, normalização, transições), Server Actions, repositórios |
| Servidor | `src/server` | Sessão/autorização, auditoria, erros, fila de tarefas, integrações externas |
| Bibliotecas | `src/lib` | Supabase, dinheiro, datas, criptografia, logging, rate limit |
| Banco | `supabase/migrations` | Esquema, RLS, triggers de integridade, funções da fila |

## Módulos de domínio
- `auth`, `organizations`: cadastro, login, recuperação, empresas, membros, convites, papéis.
- `catalog`: produtos normalizados, ofertas, deduplicação, importação CSV/XLSX.
- `suppliers`: contrato `SupplierAdapter` e adaptadores (`manual`, `file_import`, `generic_rest` não configurado).
- `pricing`: motor determinístico de lucro/preço, perfis, versões de regras, tarifas com fonte e data.
- `marketplace` (Mercado Livre): OAuth, cliente HTTP tipado, conta, categorias, validação/publicação, itens, pedidos, notificações.
- `listings`: rascunho → validação → prévia → confirmação → publicação → sincronização.
- `orders`: pedidos do marketplace, itens, pedido de compra ao fornecedor (manual/API), envios.
- `jobs`: fila, handlers e agendamento.
- `billing`: planos, limites, abstração de provedor, adaptador de desenvolvimento não financeiro.
- `admin`: painel do operador do SaaS.

## Extensibilidade
- Novo fornecedor: implementar `SupplierAdapter`, registrar em `src/server/integrations/suppliers/registry.ts`, inserir `supplier_sources`.
- Novo marketplace: novo módulo em `src/server/integrations/<marketplace>` + valor permitido em `marketplace` (check constraints).

## Renderização
`cacheComponents` desligado: todas as páginas do painel são dinâmicas e dependem da sessão (ver ADR-004).
