# Calculadora de lucratividade

Implementação: `src/features/pricing/engine.ts` (puro, determinístico, sem IA). Testes: `tests/unit/pricing-engine.test.ts`
(valores conferidos manualmente) e `tests/e2e/pricing.spec.ts` (mesmos valores pela interface).

## Fórmulas (por unidade, preço P)
- Custo da mercadoria = custo do fornecedor + frete de entrada + taxa de preparação/despacho do fornecedor.
- Custos fixos = custo da mercadoria + custos extras por unidade + custo operacional + custo fixo por venda (faixa de P) + frete pago pelo vendedor (faixa de P).
- Custos sobre o preço = P × (tarifa de venda + tributos estimados + reserva para devoluções + percentuais extras).
- Lucro = P − custos (cada componente arredondado a centavos, para que a composição exibida some exatamente).
- Margem líquida = lucro ÷ P. Markup = P ÷ custo da mercadoria − 1.
- Preço sugerido: menor preço, ao centavo, com margem ≥ alvo. Para cada faixa de preço onde custos fixos são constantes,
  P = custos fixos ÷ (1 − percentuais − margem); se P cair abaixo do início da faixa, o início já atende. O resultado é arredondado
  para cima e conferido com a composição arredondada (sobe 1 centavo enquanto a margem não for atingida).
- Preço mínimo sem prejuízo: mesmo procedimento com margem 0.

## Arredondamento
decimal.js com 40 dígitos; componentes ROUND_HALF_UP a centavos; preço sugerido ROUND_CEIL; margem/markup com 4 casas.

## Dados ausentes, estimados e desatualizados
- Sem tarifa de venda, sem alíquota de tributos ou sem regra de frete: o cálculo retorna `incomplete` com a lista do que falta e nenhum valor.
- Tarifas informadas manualmente são marcadas como estimadas e exibem fonte e data informadas pelo usuário. Não há tarifas padrão
  pré-preenchidas: os valores do Mercado Livre variam por categoria, tipo de anúncio, faixa de preço e período.
- Tributos sempre são estimativas (não constituem apuração fiscal).
- Avisos: custo do fornecedor com mais de 7 dias; referência de tarifas com mais de 30 dias.

## Versionamento e histórico
- `pricing_profiles` guarda o perfil; cada salvamento cria uma linha imutável em `pricing_rule_versions` (número sequencial atribuído pelo banco).
- `pricing_calculations` registra cada simulação com `input_snapshot` (custo, regras, preço pedido), `result_snapshot`, versão das regras e
  `calculation_version` do motor. A simulação é sempre recalculada no servidor antes de gravar.

## Tarifas oficiais (Etapa 4)
Quando houver conta do Mercado Livre conectada, o endpoint oficial de custos de venda (`/sites/{SITE}/listing_prices`) pode fornecer a tarifa
para preço/categoria/tipo de anúncio; o resultado é gravado em `marketplace_fee_snapshots` com `source = ml_api_listing_prices` e data.
