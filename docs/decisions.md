# Registro de decisões (ADR)

## ADR-001 Monólito modular Next.js + Supabase
Decisão: uma aplicação Next.js com módulos por domínio e Supabase como banco/autenticação.
Motivo: menor custo operacional para o MVP; RLS dá isolamento no banco. Descartado: microsserviços (complexidade sem demanda).

## ADR-002 Fila durável em Postgres
Decisão: tabela `sync_jobs` + funções `claim/complete/fail` com `FOR UPDATE SKIP LOCKED`, lease e backoff; executada por `/api/jobs/run` (Vercel Cron) e disparada após webhooks.
Motivo: sem serviço pago adicional; estado durável fora da memória da função. Descartado por ora: Inngest/QStash/pgmq (podem substituir o executor sem mudar o contrato).

## ADR-003 Supabase local via CLI/Docker para desenvolvimento e testes
Decisão: `supabase start` e pgTAP (`supabase test db`). Não existia projeto Supabase para este SaaS; nenhum projeto pago foi criado.

## ADR-004 `cacheComponents` desligado
Decisão: desabilitar Cache Components do Next 16. Todas as telas do painel dependem de sessão e dados por empresa; o modelo dinâmico tradicional é mais previsível e evita cache acidental de dados de tenant.

## ADR-005 Autorização em duas camadas
Decisão: checagem de papel nas Server Actions + RLS/grants de coluna no banco. Tabelas que espelham sistemas externos (contas, anúncios, pedidos, webhooks, fila, assinaturas) só são gravadas pelo servidor (service role) após autorização no código; o usuário tem leitura.
Motivo: o cliente Supabase do navegador pode chamar a API REST diretamente; o banco precisa impor as regras sozinho.

## ADR-006 Catálogo por organização
Decisão: `catalog_products.organization_id` obrigatório. Um catálogo global compartilhado pode ser criado depois com curadoria do operador.
Motivo: evitar vazamento de produtos, custos e fornecedores entre clientes.

## ADR-007 Aritmética decimal
Decisão: decimal.js com precisão 40; arredondamento ROUND_HALF_UP para centavos; preço sugerido arredondado para cima.

## ADR-008 Criptografia de tokens na aplicação
Decisão: AES-256-GCM no servidor com chaves versionadas em variável de ambiente; AAD com o id da conta. Descartado: Supabase Vault (acoplaria chave ao banco; avaliar no futuro).

## ADR-009 Leitura de planilhas
Decisão: `papaparse` (CSV) e `read-excel-file` (XLSX). Descartado: pacote `xlsx` do npm (versão publicada desatualizada com vulnerabilidades conhecidas).

## ADR-010 Cobrança
Decisão: abstração `BillingProvider` com adaptador `development` (não financeiro, bloqueado em produção) e nenhum provedor real escolhido.
Motivo: escolha comercial pendente (Stripe, Asaas, Mercado Pago, Pagar.me). Preços dos planos ficam nulos ("a definir").

## ADR-011 Servidor simulado do Mercado Livre para E2E
Decisão: `tests/mocks/mercado-livre-server.mjs` imita o formato documentado; o Next.js de testes roda isolado (porta 3100, `.next-e2e`)
com `ML_API_BASE_URL`/`ML_AUTH_BASE_URL` apontando para ele. As variáveis de sobrescrita são recusadas em produção.
Esses testes provam o fluxo da aplicação, não a integração real.

## ADR-012 Publicação síncrona e reconciliação
Decisão: publicar na própria Server Action (operação iniciada e confirmada pelo usuário), com transição atômica `validated → publishing`
(compare-and-swap na versão) e sem retentativa automática do POST. Em resultado incerto (timeout/5xx) busca o item pelo SKU do vendedor;
sem confirmação, marca falha com aviso explícito para conferir no Mercado Livre antes de repetir.

## ADR-013 Renovação de token com lease + CAS
Decisão: coluna `refresh_locked_until` (lease de 30 s) e `token_generation` (compare-and-swap). Garante uma única chamada de renovação
por geração mesmo com várias funções serverless simultâneas; testado com banco real.
