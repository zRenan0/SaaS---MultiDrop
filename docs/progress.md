# Progresso

## Etapa atual
Etapa 2 (catálogo multifonte).

## Concluído e verificado
- Etapa 0 e Etapa 1 (ver docs/implementation-plan.md).

## Testes (última execução)
| Suite | Comando | Resultado |
|---|---|---|
| Banco (pgTAP) | `pnpm test:db` | 76/76 aprovados |
| Unitários | `pnpm test` | 20/20 aprovados |
| E2E | `pnpm test:e2e` | 6/6 aprovados (desktop + mobile) |
| Typecheck/Lint | `pnpm typecheck && pnpm lint` | sem erros |

## Bloqueios externos
- Mercado Livre: aplicação no DevCenter, `ML_CLIENT_ID`, `ML_CLIENT_SECRET`, `ML_REDIRECT_URI` (HTTPS público) e usuários de teste.
- Supabase de produção: projeto não criado (decisão/custo do proprietário). Variáveis: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`.
- Vercel: projeto não criado. Variáveis adicionais: `TOKEN_ENCRYPTION_KEYS`, `CRON_SECRET`, `NEXT_PUBLIC_APP_URL`.
- E-mail transacional (convites/confirmação em produção): provedor SMTP a definir no Supabase Auth.
- Provedor de pagamento: escolha comercial pendente.
- Fornecedor com API real: nenhum contrato/documentação disponível.

## Próxima tarefa concreta
Implementar conexões de fornecedor e cadastro manual de produto + oferta (Etapa 2).
