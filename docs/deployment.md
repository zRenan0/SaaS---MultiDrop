# Deploy

> Nenhum deploy de produção foi feito. Exige autorização do proprietário.

## Supabase
1. Criar projeto (região `sa-east-1` recomendada para o Brasil).
2. `supabase link --project-ref <ref>` e `supabase db push` (aplica `supabase/migrations`).
3. `update private.app_settings set value = 'production' where key = 'environment';`
4. Auth: Site URL = `NEXT_PUBLIC_APP_URL`; redirect `https://<app>/auth/callback`; SMTP próprio para e-mails; confirmação de e-mail ligada.
5. Conceder operador: `pnpm admin:grant <email>` com as variáveis de produção.

## Vercel
Variáveis (Production): `NEXT_PUBLIC_APP_NAME`, `NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`,
`SUPABASE_SECRET_KEY`, `TOKEN_ENCRYPTION_KEYS`, `TOKEN_ENCRYPTION_ACTIVE_VERSION`, `ML_CLIENT_ID`, `ML_CLIENT_SECRET`, `ML_REDIRECT_URI`,
`ML_SITE_ID`, `ML_USE_PKCE`, `CRON_SECRET`, `BILLING_PROVIDER=none`.
Nunca definir `ML_API_BASE_URL`/`ML_AUTH_BASE_URL` em produção (a aplicação recusa).

Cron: `vercel.json` agenda `/api/jobs/run` a cada 5 minutos (exige plano Pro; no Hobby use agendador externo com `Authorization: Bearer <CRON_SECRET>`).

## Mercado Livre
URI de redirecionamento `https://<app>/api/integrations/mercado-livre/callback`; notificações `https://<app>/api/webhooks/mercado-livre`
(tópicos `orders_v2`, `items`, `shipments`).

## Rotação de chave de criptografia
Adicionar nova versão em `TOKEN_ENCRYPTION_KEYS` (`1:...,2:...`), mudar `TOKEN_ENCRYPTION_ACTIVE_VERSION=2`. Tokens antigos continuam
legíveis; renovações regravam com a chave nova. Remover a versão antiga só depois que nenhum registro usar `encryption_key_version = 1`.

## Checklist antes de produção
Ver `docs/progress.md` (bloqueios) e `docs/security.md` (pendências).
