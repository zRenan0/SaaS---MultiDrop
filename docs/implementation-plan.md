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
- [x] Fornecedores (conexões, acordo de despacho) e contrato `SupplierAdapter` (manual, file_import, generic_rest não configurado)
- [x] Cadastro manual de produto + oferta; oferta adicional por fornecedor; edição com controle otimista
- [x] Importação CSV/XLSX: mapeamento sugerido, prévia, validação por linha, duplicidade, rejeitados (CSV), histórico, reimportação
- [x] Gravação em lote transacional (`upsert_catalog_rows`) com deduplicação por SKU/GTIN/título+marca+modelo
- [x] Listagem com busca (título, marca, SKU, GTIN), filtros (fornecedor, sem estoque), ordenação e paginação

## Etapa 3: calculadora
- [x] Motor determinístico com faixas de preço + testes com cálculo independente (docs/pricing.md)
- [x] Perfis, versões imutáveis de regra, tarifas com fonte/data, cenários, comparação de fornecedores, histórico
- [x] Bloqueio de resultado quando faltam parâmetros; sinalização de estimativas e dados desatualizados

## Etapa 4: Mercado Livre
- [x] Documentação de endpoints e requisitos (docs/integrations.md) — itens (V) pendentes de confirmação com conta real
- [x] OAuth (state de uso único + cookie, PKCE S256), credenciais cifradas no schema private, renovação com lease + CAS, reautorização, desconexão
- [x] Consulta da conta (modelo User Products pela tag), sugestão de categoria, atributos obrigatórios, tipos de anúncio, tarifa oficial registrada
- [x] Rascunho, validação local + /items/validate, prévia, lucro com tarifa oficial, publicação com papel admin + "PUBLICAR" + diálogo, reconciliação por SKU em resultado incerto, consulta posterior
- [x] Pesquisa de preços no catálogo oficial com fonte, data e limitação
- [B] Teste real com aplicação e usuário de teste do Mercado Livre (aguarda credenciais)

## Etapa 5: pedidos e sincronização
- [ ] Webhook, deduplicação, fila, consulta de pedidos, sincronização de estoque/preço, tela de pedidos, encaminhamento manual

## Etapa 6: operação comercial
- [ ] Planos e limites (banco já aplica), página de assinatura, billing provider, painel administrativo, métricas, documentação legal

## Etapa 7: revisão final
- [ ] Todos os testes, revisão de RLS e rotas públicas, deploy documentado, lista de pendências
