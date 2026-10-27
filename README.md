# MultiDrop

SaaS multiempresa para vender no Mercado Livre com produtos de vários fornecedores, sem estoque próprio
(dropshipping quando houver acordo com o fornecedor). Nome exibido configurável por `NEXT_PUBLIC_APP_NAME`.

**Estado:** versão executável com testes automatizados. Integração real com Mercado Livre e provedor de pagamento
ainda não validadas (ver [docs/progress.md](docs/progress.md)). Não usar em produção antes de concluir a lista de pendências.

## Funcionalidades
- Empresas, membros, papéis (proprietário, administrador, operador, leitura), convites, isolamento por RLS
- Catálogo: fornecedores, cadastro manual, importação CSV/XLSX com prévia e relatório de rejeitadas
- Calculadora de lucro determinística (faixas de tarifa e frete, preço mínimo, preço sugerido, cenários, histórico)
- Mercado Livre: OAuth com PKCE, tokens cifrados, categorias e atributos, validação oficial, publicação com confirmação,
  pesquisa de preços no catálogo
- Pedidos: notificações, fila durável, ingestão idempotente, sincronização de estoque, encaminhamento manual ao fornecedor
- Planos e limites no banco, cobrança abstrata (sem provedor real), painel do operador, exportação de dados

## Requisitos
Node.js 22+, pnpm 10, Docker (para o Supabase local).

## Instalação local
```bash
pnpm install
pnpm db:start                 # sobe Supabase local (Docker) e aplica as migrações
cp .env.example .env.local    # preencha com os valores de `pnpm supabase status -o env`
# gere a chave de criptografia:
node -e "console.log('1:'+require('crypto').randomBytes(32).toString('base64'))"
pnpm dev                      # http://localhost:3000
```
Variáveis mínimas: `NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`,
`SUPABASE_SECRET_KEY`, `TOKEN_ENCRYPTION_KEYS`. Mercado Livre e cobrança são opcionais; as telas mostram o que falta configurar.

Acesso ao painel do operador: crie a conta e rode `pnpm admin:grant seu@email`.

## Testes
```bash
pnpm typecheck && pnpm lint
pnpm test               # unitários
pnpm test:db            # pgTAP (RLS e regras do banco)
pnpm test:integration   # API + banco local
pnpm test:e2e           # Playwright (Mercado Livre SIMULADO; não prova integração real)
```

## Documentação
| Documento | Conteúdo |
|---|---|
| [CLAUDE.md](CLAUDE.md) | Regras permanentes do repositório |
| [docs/architecture.md](docs/architecture.md) | Arquitetura e módulos |
| [docs/data-model.md](docs/data-model.md) | Modelo de dados |
| [docs/security.md](docs/security.md) | Controles de segurança e pendências |
| [docs/integrations.md](docs/integrations.md) | Mercado Livre e fornecedores |
| [docs/pricing.md](docs/pricing.md) | Fórmulas da calculadora |
| [docs/billing.md](docs/billing.md) | Planos, cobrança e como conectar provedor |
| [docs/privacy.md](docs/privacy.md) | Dados pessoais, retenção, exportação e exclusão |
| [docs/deployment.md](docs/deployment.md) | Deploy em Supabase + Vercel |
| [docs/testing.md](docs/testing.md) | Estratégia de testes |
| [docs/support.md](docs/support.md) | Rotina de suporte e operação |
| [docs/decisions.md](docs/decisions.md) | Decisões arquiteturais |
| [docs/progress.md](docs/progress.md) | Progresso, bloqueios e próximos passos |
