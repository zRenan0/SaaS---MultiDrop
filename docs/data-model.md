# Modelo de dados

Migrações: `supabase/migrations/2026102700000{1..7}_*.sql`. Tipos TS gerados em `src/types/database.ts`.

## Princípios
- Toda tabela de tenant tem `organization_id NOT NULL` e `UNIQUE (organization_id, id)`; referências entre tabelas de tenant
  usam **chaves estrangeiras compostas** `(organization_id, x_id)`, o que torna impossível ligar registros de empresas diferentes.
- Trigger `private.prevent_organization_change` impede mover registros entre empresas (inclusive pelo service role).
- Valores monetários `numeric(14,2)`; taxas `numeric(7,6)` como fração (0,12 = 12%).
- `version` (incrementado por trigger) em ofertas, rascunhos, anúncios, pedidos e pedidos de compra: controle otimista de concorrência.
- Segredos ficam no schema `private` (não exposto pela API REST): `marketplace_credentials`, `supplier_credentials`, `oauth_states`,
  `rate_limit_buckets`, `app_settings`.

## Entidades
| Grupo | Tabelas |
|---|---|
| SaaS | organizations, organization_members, profiles, organization_invitations, platform_admins, audit_logs, admin_audit_logs |
| Cobrança | plans, subscriptions, subscription_events, usage_records |
| Catálogo | supplier_sources (global), supplier_connections, catalog_products, supplier_offers, catalog_import_runs, competitor_snapshots |
| Marketplace | marketplace_accounts, private.marketplace_credentials, private.oauth_states, listing_drafts, marketplace_listings, listing_variants |
| Preço | pricing_profiles, pricing_rule_versions (imutável, versão sequencial), marketplace_fee_snapshots, pricing_calculations |
| Pedidos | orders, order_items, supplier_purchase_orders, shipments |
| Operação | webhook_events, sync_jobs, integration_errors |

## Ajustes em relação à especificação inicial
- `catalog_products` ganhou `organization_id`: catálogo por empresa evita vazamento de produtos cadastrados por um cliente para outro (ADR-006).
- `listing_variants`, `order_items`, `shipments`, `marketplace_credentials` também carregam `organization_id` (RLS simples e FKs compostas).
- `marketplace_fee_snapshots.organization_id` é nulo para tarifas obtidas da API oficial e preenchido para parâmetros manuais da empresa.
- `listing_drafts` ganhou `family_name` (User Products), `idempotency_key` e trava de conteúdo após publicação.
- `orders.fulfillment_status` (interno) separado de `orders.status` (espelho do marketplace).
- `supplier_purchase_orders` tem máquina de estados aplicada por trigger e `idempotency_key`.
- `subscription_events` registra histórico de mudanças de assinatura automaticamente.

## Regras aplicadas no banco
- Limites de plano (`private.enforce_plan_limit`): membros, produtos, ofertas, contas ML, anúncios ativos, importações/mês.
- Assinatura do provedor `development` é ignorada quando `private.app_settings.environment = 'production'`.
- Rascunho de anúncio: alterar conteúdo volta para `draft`; publicado/publicando não pode ser alterado.
- Pedido externo único por conta (`unique (marketplace_account_id, external_order_id)`); conta ML conectada a no máximo uma empresa.
- Fila: dedup por `deduplication_key` entre tarefas pendentes/em execução; lease com recuperação de tarefas abandonadas.
