# Progresso

## Etapa atual
Etapa 7 (revisão final).

## Concluído e verificado
- Etapas 0 a 6 (ver docs/implementation-plan.md). Etapas 4 e 5 validadas só com servidor simulado; teste real pendente.

## Testes (última execução)
| Suite | Comando | Resultado |
|---|---|---|
| Banco (pgTAP) | `pnpm test:db` | 76/76 aprovados |
| Unitários | `pnpm test` | 69/69 aprovados |
| Integração | `pnpm test:integration` | 20/20 aprovados |
| E2E | `pnpm test:e2e` | 13/13 aprovados (Mercado Livre SIMULADO) |
| Typecheck/Lint | `pnpm typecheck && pnpm lint` | sem erros |

## Bloqueios externos
- Mercado Livre: aplicação no DevCenter, `ML_CLIENT_ID`, `ML_CLIENT_SECRET`, `ML_REDIRECT_URI` (HTTPS público) e usuários de teste.
- Supabase de produção: projeto não criado (decisão/custo do proprietário). Variáveis: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`.
- Vercel: projeto não criado. Variáveis adicionais: `TOKEN_ENCRYPTION_KEYS`, `CRON_SECRET`, `NEXT_PUBLIC_APP_URL`.
- E-mail transacional (convites/confirmação em produção): provedor SMTP a definir no Supabase Auth.
- Provedor de pagamento: escolha comercial pendente.
- Fornecedor com API real: nenhum contrato/documentação disponível.

## Próxima tarefa concreta
Etapa 7: revisão de RLS/grants de todas as tabelas (pgTAP cobrindo tabelas novas), revisão das rotas públicas, varredura de
dependências, README de instalação, lista final de bloqueios para produção.

## Testes reais pendentes (precisam de credenciais)
- Conectar conta de teste do Mercado Livre, consultar /users/me, confirmar tag `user_product_seller`.
- /items/validate e POST /items com usuário de teste; confirmar formato de listing_prices para MLB.
- Renovação de token real (confirmar rotação do refresh token) e busca por `seller_sku`.
- Notificações reais `orders_v2`/`items`/`shipments` na URL pública; consulta /orders/{id} e /orders/search; PUT de estoque em item User Products.
- Vercel Cron: plano Hobby só permite execução diária; para a cada 5 min é necessário plano Pro (ou agendador externo chamando `/api/jobs/run` com `CRON_SECRET`).
