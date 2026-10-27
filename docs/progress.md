# Progresso

## Etapa atual
Etapa 5 (pedidos, webhooks e sincronização).

## Concluído e verificado
- Etapas 0 a 4 (ver docs/implementation-plan.md). Etapa 4 validada só com servidor simulado; teste real pendente.

## Testes (última execução)
| Suite | Comando | Resultado |
|---|---|---|
| Banco (pgTAP) | `pnpm test:db` | 76/76 aprovados |
| Unitários | `pnpm test` | 61/61 aprovados |
| Integração | `pnpm test:integration` | 10/10 aprovados |
| E2E | `pnpm test:e2e` | 10/10 aprovados (inclui Mercado Livre SIMULADO) |
| Typecheck/Lint | `pnpm typecheck && pnpm lint` | sem erros |

## Bloqueios externos
- Mercado Livre: aplicação no DevCenter, `ML_CLIENT_ID`, `ML_CLIENT_SECRET`, `ML_REDIRECT_URI` (HTTPS público) e usuários de teste.
- Supabase de produção: projeto não criado (decisão/custo do proprietário). Variáveis: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`.
- Vercel: projeto não criado. Variáveis adicionais: `TOKEN_ENCRYPTION_KEYS`, `CRON_SECRET`, `NEXT_PUBLIC_APP_URL`.
- E-mail transacional (convites/confirmação em produção): provedor SMTP a definir no Supabase Auth.
- Provedor de pagamento: escolha comercial pendente.
- Fornecedor com API real: nenhum contrato/documentação disponível.

## Próxima tarefa concreta
Etapa 5: rota pública `/api/webhooks/mercado-livre` (validação, rate limit, deduplicação em `webhook_events`, enfileiramento),
executor da fila `/api/jobs/run` (Vercel Cron + CRON_SECRET), handler `orders_v2` (consulta /orders/{id}, grava pedido e itens,
liga itens a anúncios/ofertas), sincronização de estoque anúncio ← oferta, tela de pedidos e encaminhamento manual ao fornecedor.

## Testes reais pendentes (precisam de credenciais)
- Conectar conta de teste do Mercado Livre, consultar /users/me, confirmar tag `user_product_seller`.
- /items/validate e POST /items com usuário de teste; confirmar formato de listing_prices para MLB.
- Renovação de token real (confirmar rotação do refresh token) e busca por `seller_sku`.
