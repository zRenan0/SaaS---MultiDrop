# Segurança

## Controles implementados
| Requisito | Implementação |
|---|---|
| Isolamento entre empresas | RLS em todas as tabelas públicas; políticas por operação usando `private.org_ids_with_role(papel)`; FKs compostas; trigger contra troca de `organization_id` |
| Autorização no servidor | `requireRole`/`requirePermission` em toda Server Action; organização ativa revalidada no banco (cookie é só preferência) |
| Papéis | owner > admin > operator > viewer, espelhados em `src/features/organizations/roles.ts` e nas políticas |
| Privilégios mínimos | `revoke all` de `anon`/`authenticated` e grants explícitos por coluna (ex.: cliente não altera `organization_id`, `status` de assinatura, status de pedidos do marketplace) |
| Segredos | Apenas no servidor; nenhuma chave secreta em `NEXT_PUBLIC_*`; `createAdminClient` marcado `server-only` |
| Tokens em repouso | AES-256-GCM, chave versionada em `TOKEN_ENCRYPTION_KEYS` (fora do banco/repositório), AAD vinculando o token à conta |
| Credenciais | Schema `private` sem grants para `anon`/`authenticated` |
| SECURITY DEFINER | Somente onde indispensável e documentado: `org_ids_with_role`/`has_org_role` (evitar recursão de RLS, respondem só sobre `auth.uid()`), `create_organization`, `accept_invitation` (valida e-mail do JWT e hash do token), triggers de perfil/auditoria/assinatura/limite, `rate_limit_hit` (somente service role) |
| Validação de entrada | Zod em todas as ações e rotas; checks no banco |
| Rate limit | `public.rate_limit_hit` (Postgres) em login, cadastro, recuperação de senha, OAuth e webhook |
| Open redirect | `safeNextPath` aceita apenas caminhos internos |
| CSRF | Server Actions do Next.js validam origem; OAuth usa `state` de uso único vinculado a usuário + organização + cookie httpOnly |
| XSS | React escapa saída; nenhum `dangerouslySetInnerHTML`; CSP (`default-src 'self'`, `frame-ancestors 'none'`, `connect-src 'self'`) e cabeçalhos em `next.config.ts` |
| Logs | `logger` estruturado com remoção de chaves sensíveis e padrões de token |
| Auditoria | `audit_logs` (por empresa) e `admin_audit_logs` (operador); mudanças de membros auditadas por trigger |
| Importação de arquivos | Limite de tamanho e linhas, tipos permitidos, neutralização de fórmulas (CSV injection), validação por linha |
| URLs externas | Imagens só `https://` e sem hosts internos (`isSafePublicUrl`) |
| Rotas administrativas | `/admin` exige registro em `platform_admins` (consultado no banco, nunca metadado) |
| Ambientes | `private.app_settings.environment`; adaptador de cobrança de desenvolvimento bloqueado em produção |

## Verificações automatizadas (Etapa 7)
- `supabase/tests/database/03_security_sweep.test.sql`: RLS em todas as tabelas públicas; nenhum privilégio de `anon`; nenhum privilégio
  de usuários no schema `private`; funções executáveis por usuários e funções SECURITY DEFINER conferidas contra lista revisada;
  `search_path` fixo; isolamento de leitura/alteração/exclusão verificado em **todas** as tabelas com `organization_id`.
- `tests/e2e/security.spec.ts`: cabeçalhos, rotas públicas (payload inválido, tamanho, segredo do cron, webhook de cobrança sem provedor),
  acesso cruzado a produto e exportação sem segredos.
- `pnpm audit --prod`: sem vulnerabilidades conhecidas (27/10/2026). Em dependências de desenvolvimento há 1 aviso de severidade baixa
  (`deepmerge` via CLI `shadcn`, sem correção publicada; não vai para produção).

## Pendências conhecidas
- Envio de e-mail transacional (convites) não configurado: link de convite exibido uma vez ao administrador.
- CSP usa `'unsafe-inline'` para scripts (Next.js sem nonce). Evolução: CSP com nonce via `proxy.ts`.
- `pnpm audit` em CI ainda não configurado (não há pipeline de CI no repositório).
- Rotina de limpeza de `webhook_events`/`sync_jobs` antigos (proposta em docs/privacy.md) não implementada.
- Revisão de segurança externa (pentest) antes do lançamento comercial.

## Resposta a incidentes (base)
1. Revogar credenciais afetadas (rotacionar `TOKEN_ENCRYPTION_KEYS` com nova versão, `SUPABASE_SECRET_KEY`, segredo ML).
2. Desconectar contas de marketplace afetadas (apaga tokens) e solicitar nova autorização.
3. Consultar `audit_logs`, `admin_audit_logs`, `webhook_events` e logs da Vercel para delimitar o impacto.
4. Notificar clientes e, quando aplicável, a ANPD conforme a LGPD (avaliação jurídica necessária).
