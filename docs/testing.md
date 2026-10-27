# Testes

| Suite | Comando | Escopo |
|---|---|---|
| Unitários | `pnpm test` | Regras puras: dinheiro, preço, normalização, importação, papéis, payload ML, OAuth, tokens, fila, cobrança |
| Banco | `pnpm test:db` | pgTAP: RLS, isolamento, grants de coluna, FKs compostas, limites, transições, fila |
| Integração | `pnpm test:integration` | Supabase local real via API: RPCs de catálogo, credenciais cifradas e renovação concorrente, pedidos, webhook, fila, planos |
| E2E | `pnpm test:e2e` | Playwright em Next isolado (porta 3100) + Mercado Livre SIMULADO (porta 4010) |

Pré-requisitos: Docker, `pnpm db:start`, `.env.local` (ver `.env.example`).

## O que os testes NÃO comprovam
- Integração real com o Mercado Livre (endpoints marcados (V) em `docs/integrations.md`).
- Provedor de pagamento real (não implementado).
- Envio de e-mails do Supabase Auth em produção.

## Testes reais pendentes
Ver `docs/progress.md`.
