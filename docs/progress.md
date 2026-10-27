# Progresso

## Etapa atual
Etapa 4 (Mercado Livre): pesquisa de documentação iniciada, código ainda não escrito.

## Concluído e verificado
- Etapas 0, 1, 2 e 3 (ver docs/implementation-plan.md).

## Testes (última execução)
| Suite | Comando | Resultado |
|---|---|---|
| Banco (pgTAP) | `pnpm test:db` | 76/76 aprovados |
| Unitários | `pnpm test` | 42/42 aprovados |
| Integração | `pnpm test:integration` | 5/5 aprovados |
| E2E | `pnpm test:e2e` | 8/8 aprovados (desktop + mobile) |
| Typecheck/Lint | `pnpm typecheck && pnpm lint` | sem erros |

## Bloqueios externos
- Mercado Livre: aplicação no DevCenter, `ML_CLIENT_ID`, `ML_CLIENT_SECRET`, `ML_REDIRECT_URI` (HTTPS público) e usuários de teste.
- Supabase de produção: projeto não criado (decisão/custo do proprietário). Variáveis: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`.
- Vercel: projeto não criado. Variáveis adicionais: `TOKEN_ENCRYPTION_KEYS`, `CRON_SECRET`, `NEXT_PUBLIC_APP_URL`.
- E-mail transacional (convites/confirmação em produção): provedor SMTP a definir no Supabase Auth.
- Provedor de pagamento: escolha comercial pendente.
- Fornecedor com API real: nenhum contrato/documentação disponível.

## Próxima tarefa concreta
Etapa 4: escrever docs/integrations.md e implementar OAuth do Mercado Livre (state + PKCE, tokens cifrados, renovação com CAS em token_generation).
Notas da pesquisa (páginas oficiais retornam 403 para busca automatizada; confirmar com conta de teste):
- Token: POST https://api.mercadolibre.com/oauth/token (x-www-form-urlencoded); access token ~6h; refresh token deve ser substituído a cada renovação.
- Vendedores com tag `user_product_seller` (GET /users/me) publicam no modelo User Products: `family_name` obrigatório, sem `variations`, título gerado pelo ML.
- Validação prévia: POST /items/validate. Tarifas: GET /sites/MLB/listing_prices?price=&listing_type_id=&category_id=.
- Notificações: payload com _id, resource, user_id, topic, application_id, attempts; tópico recomendado `orders_v2`; responder 200 rápido e consultar o recurso.
- Concorrência: relatos de 403 em /sites/MLB/search e /items de outros vendedores; usar /products/search e /products/{id}/items (catálogo) e registrar a limitação.
