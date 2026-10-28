# Progresso

## Etapa atual
Etapas 0 a 7 concluídas dentro do que é possível sem credenciais externas. Próximo ciclo: validação real (ver abaixo).

## Concluído e verificado
Ver docs/implementation-plan.md. Integrações com Mercado Livre (Etapas 4 e 5) verificadas **somente com servidor simulado**.

## Testes (última execução completa)
| Suite | Comando | Resultado |
|---|---|---|
| Typecheck / Lint | `pnpm typecheck && pnpm lint` | sem erros |
| Build | `pnpm build` | sucesso |
| Banco (pgTAP) | `pnpm test:db` | 89/89 aprovados |
| Unitários | `pnpm test` | 69/69 aprovados |
| Integração | `pnpm test:integration` | 20/20 aprovados |
| E2E | `pnpm test:e2e` | 16/16 aprovados (Mercado Livre SIMULADO) |
| Dependências | `pnpm audit --prod` | sem vulnerabilidades conhecidas |

## Bloqueios para produção (dependem do proprietário)
| Item | O que falta | Variáveis/ações |
|---|---|---|
| Mercado Livre | Aplicação no DevCenter, usuário de teste, URL HTTPS pública | `ML_CLIENT_ID`, `ML_CLIENT_SECRET`, `ML_REDIRECT_URI`; configurar URL de notificações |
| Supabase produção | Projeto criado, migrações aplicadas, `environment = 'production'`, SMTP | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY` |
| Vercel | Projeto, variáveis, plano com cron a cada 5 min (ou agendador externo) | `NEXT_PUBLIC_APP_URL`, `TOKEN_ENCRYPTION_KEYS`, `CRON_SECRET` |
| Cobrança | Escolha do provedor, credenciais, implementação do adaptador | `BILLING_PROVIDER` + credenciais do provedor (docs/billing.md) |
| Comercial | Preços e limites definitivos dos planos | tabela `plans` |
| Jurídico | Termos, privacidade, retenção, DPA, enquadramento tributário | revisão por advogado e contador |
| Suporte | Canal oficial | atualizar páginas legais e docs/support.md |
| Fornecedor com API | Contrato e documentação de um fornecedor real | novo adaptador `SupplierAdapter` |

## Testes reais pendentes (precisam de credenciais)
- Conectar conta de teste do Mercado Livre; confirmar `/users/me` e a tag `user_product_seller`.
- `/items/validate` e `POST /items` com usuário de teste; formato de `listing_prices` para MLB; busca por `seller_sku`.
- Renovação real de token (rotação do refresh token).
- Notificações reais `orders_v2`/`items`/`shipments`; `/orders/{id}`, `/orders/search`; PUT de estoque em item User Products.
- Catálogo `/products/search` e `/products/{id}/items` com o token da aplicação.

## Próxima tarefa concreta
1. Ambiente de homologação:
   - Supabase criado (projeto `mlzwngvdeywphxcqvicf`, região sa-east-1), 11 migrações aplicadas, `app_settings.environment = 'production'`.
   - Vercel: o conector não tem permissão para criar projeto (403). Proprietário cria o projeto pelo painel, importando o repositório, e cadastra as variáveis de `.env.example` (segredos gerados por ele, nunca colados no chat).
   - Proprietário: Site URL e Redirect URLs do Supabase Auth apontando para o domínio da Vercel; aplicação no DevCenter do Mercado Livre.
2. Executar o roteiro de testes reais acima, registrar evidências em `docs/evidence/` e corrigir divergências de formato.
3. Escolher o provedor de pagamento e implementar o adaptador.
