# Planos e cobrança

## Como funciona
- Planos em `public.plans` (limites em `limits`, recursos em `features`, preço em centavos ou NULL = a definir).
- Toda empresa nasce com assinatura `internal` no plano padrão (sem cobrança).
- Plano efetivo (`private.effective_plan_code`): assinatura ativa de provedor externo mais recente; senão a interna; senão o plano padrão.
  Assinaturas `development` são ignoradas quando `private.app_settings.environment = 'production'`.
- Limites aplicados por trigger no banco (membros, produtos, ofertas, contas ML, anúncios ativos, importações/mês) e recursos
  verificados no servidor (ex.: `competitors`).
- Histórico automático em `subscription_events`; consumo mensal em `usage_records` (tarefa `billing.usage_snapshot`, diária).

## Provedores
| `BILLING_PROVIDER` | Comportamento |
|---|---|
| `none` (padrão) | Troca de plano desabilitada; operador pode conceder plano interno no painel `/admin` (cortesia, sem cobrança) |
| `development` | Ativa o plano na hora, **sem cobrança**. Recusado em produção (código) e ignorado pelo banco em produção |
| `stripe`, `asaas`, `mercadopago`, `pagarme` | Não implementados. Retornam ao comportamento `none` |

### Como conectar um provedor real
1. Escolher o provedor (decisão comercial pendente) e obter credenciais de teste e produção.
2. Implementar `BillingProvider` em `src/server/integrations/billing/<provedor>.ts`: `startSubscription` cria checkout e retorna `redirect`;
   o plano **só** é ativado pelo webhook confirmado.
3. `handleWebhook`: validar assinatura criptográfica do provedor, deduplicar por `subscription_events.external_event_id`
   (único por provedor), mapear status para `subscription_status` e gravar com service role.
4. Configurar a URL `https://<app>/api/billing/webhook/<provedor>` no provedor.
5. Definir `update private.app_settings set value = 'production' where key = 'environment';` no banco de produção.
6. Testes de contrato com eventos reais de homologação.

## Sugestões comerciais (não implementadas como decisão)
Valores de referência para discussão, sem validação de mercado: plano gratuito para avaliação; planos pagos diferenciados por número de
anúncios ativos, contas do Mercado Livre e recursos (pesquisa de concorrentes, API de fornecedores). Preço, período de teste,
cobrança anual e política de reembolso dependem de decisão do proprietário e de revisão jurídica/contábil.
