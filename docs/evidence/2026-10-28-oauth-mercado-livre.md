# Evidência: OAuth real do Mercado Livre (homologação)

Data: 28/10/2026, 13h01 (America/Sao_Paulo). Ambiente: `https://saa-s-multi-drop.vercel.app` + Supabase `mlzwngvdeywphxcqvicf`.

## Resultado
- Fluxo OAuth com PKCE concluído pela interface; conta gravada com status `active`, site `MLB`.
- `/users/me` respondeu e as tags foram lidas: `normal`, `messages_as_seller`, `user_product_seller`. A conta opera no modelo User Products.
- Credenciais gravadas somente em `private.marketplace_credentials`, cifradas (chave versão 1), geração 1, validade de 6 horas.
- Escopos concedidos incluem `offline_access` (refresh token), `publish-sync` leitura/escrita e `orders-shipments` somente leitura.

## Observações
- Tentativas anteriores (27/10 e manhã de 28/10) saíram para o Mercado Livre e não voltaram; o proprietário ajustou a aplicação no DevCenter.
- A conta conectada é a conta real do proprietário, não um usuário de teste. Publicação, alteração de estoque e qualquer escrita
  devem ser feitas com usuário de teste (`POST /users/test_user`) ou com autorização explícita item a item.
