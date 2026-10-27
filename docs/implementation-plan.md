# Plano de implementação

Status: [x] concluído e verificado · [~] parcial · [ ] pendente · [B] bloqueado por dependência externa

## Etapa 0: inspeção e preparação
- [x] Inspeção (repositório vazio; Node 22, pnpm 10, Docker disponível; nenhum projeto Supabase/Vercel deste SaaS)
- [x] CLAUDE.md, architecture, data-model, security, decisions, progress
- [x] Comandos de desenvolvimento e testes definidos (`package.json`)

## Etapa 1: fundação do SaaS
- [x] Next.js 16 + TS estrito + Tailwind 4 + shadcn/ui
- [x] Supabase local, migrações, RLS, grants de coluna
- [x] Cadastro, login, logout, recuperação e redefinição de senha
- [x] Organizações, membros, papéis, convites, troca de empresa ativa validada no servidor
- [x] Layout (sidebar, cabeçalho com busca e conta, mobile)
- [x] Testes pgTAP de isolamento; E2E de cadastro, empresa, isolamento, convite e navegação mobile
- [x] `.env.example`

## Etapa 2: catálogo multifonte
- [ ] Fornecedores (conexões) e contrato `SupplierAdapter`
- [ ] Cadastro manual de produto + oferta
- [ ] Importação CSV/XLSX: mapeamento, prévia, validação, duplicidade, rejeitados, histórico, reimportação
- [ ] Listagem com busca, filtros, ordenação e paginação

## Etapa 3: calculadora
- [ ] Motor determinístico + testes com cálculo independente
- [ ] Perfis, versões de regra, tarifas com fonte/data, cenários, comparação de fornecedores, histórico

## Etapa 4: Mercado Livre
- [ ] Documentação de endpoints (docs/integrations.md)
- [ ] OAuth (state, PKCE), credenciais cifradas, renovação com CAS, desconexão
- [ ] Consulta da conta, categorias, atributos, tarifas oficiais
- [ ] Rascunho, validação, prévia, publicação controlada e consulta posterior

## Etapa 5: pedidos e sincronização
- [ ] Webhook, deduplicação, fila, consulta de pedidos, sincronização de estoque/preço, tela de pedidos, encaminhamento manual

## Etapa 6: operação comercial
- [ ] Planos e limites (banco já aplica), página de assinatura, billing provider, painel administrativo, métricas, documentação legal

## Etapa 7: revisão final
- [ ] Todos os testes, revisão de RLS e rotas públicas, deploy documentado, lista de pendências
