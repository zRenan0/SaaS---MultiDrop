# Integrações

## Mercado Livre

### Situação da pesquisa (27/10/2026)
As páginas de developers.mercadolivre.com.br recusam acesso automatizado (HTTP 403) neste ambiente. Os itens abaixo foram
levantados por busca na documentação oficial indexada e precisam ser **confirmados com a aplicação e um usuário de teste**
antes do uso comercial. Itens marcados com (V) devem ser verificados na primeira execução real.

### Requisitos da aplicação (DevCenter)
- Criar aplicação em https://developers.mercadolivre.com.br/devcenter com a URI de redirecionamento exata (`ML_REDIRECT_URI`, HTTPS fora de localhost).
- Escopos: leitura, escrita e `offline_access` (necessário para receber refresh token).
- Habilitar PKCE na aplicação (quando habilitado, `code_verifier` passa a ser obrigatório). Configurável por `ML_USE_PKCE`.
- Configurar a URL de notificações (`https://<app>/api/webhooks/mercado-livre`) e os tópicos: `orders_v2`, `items`, `shipments` (V).
- Publicação real só com usuário de teste ou com autorização explícita do vendedor. Usuários de teste: `POST /users/test_user` (V).

### Endpoints usados
| Uso | Método e caminho | Observações |
|---|---|---|
| Autorização | `GET https://auth.mercadolivre.com.br/authorization?response_type=code&client_id&redirect_uri&state&code_challenge&code_challenge_method=S256` | `state` de uso único |
| Troca de código | `POST https://api.mercadolibre.com/oauth/token` (`application/x-www-form-urlencoded`: grant_type=authorization_code, client_id, client_secret, code, redirect_uri, code_verifier) | resposta: access_token, expires_in (~21600 s), refresh_token, user_id, scope |
| Renovação | mesmo endpoint, grant_type=refresh_token | sempre gravar o novo refresh token; tratar o anterior como inválido |
| Conta | `GET /users/me` | `id`, `nickname`, `site_id`, `tags` (`user_product_seller` indica modelo User Products) |
| Categoria sugerida | `GET /sites/{SITE}/domain_discovery/search?q=` | |
| Categoria / atributos | `GET /categories/{id}`, `GET /categories/{id}/attributes` | atributos com tag `required`/`catalog_required` |
| Tipos de anúncio | `GET /users/{id}/available_listing_types?category_id=` (V) | |
| Tarifas | `GET /sites/{SITE}/listing_prices?price=&listing_type_id=&category_id=` | `sale_fee_amount`, `sale_fee_details` (V para MLB) |
| Validar anúncio | `POST /items/validate` | 204 = válido; 400 com `cause[]` |
| Publicar | `POST /items` | User Products: `family_name` obrigatório, sem `variations`, título gerado pelo ML |
| Descrição | `POST /items/{id}/description` `{ plain_text }` | |
| Consultar anúncio | `GET /items/{id}` | `status`, `permalink`, `user_product_id`, `available_quantity`, `price` |
| Atualizar preço/estoque | `PUT /items/{id}` `{ price, available_quantity }` | para User Products o estoque pode ser por UP (V) |
| Buscar itens do vendedor por SKU | `GET /users/{id}/items/search?seller_sku=` (V) | recuperação de publicação com resultado incerto |
| Pedido | `GET /orders/{id}`, `GET /orders/search?seller={id}&sort=date_desc` | |
| Envio | `GET /shipments/{id}` | |
| Catálogo (concorrência) | `GET /products/search?site_id=&q=`, `GET /products/{id}/items` | ver limitações |
| Notificações perdidas | `GET /missed_feeds?app_id=` (V) | |

### Notificações
Payload: `{ _id, resource, user_id, topic, application_id, attempts, sent, received }`. Não há assinatura criptográfica documentada
para este fluxo; os controles adotados são:
1. validar formato (Zod) e `application_id` igual a `ML_CLIENT_ID`;
2. aceitar só tópicos esperados e `resource` com formato conhecido;
3. responder 200 rapidamente após gravar o evento (deduplicado por `_id` ou hash de tópico+recurso+usuário);
4. **nunca confiar no conteúdo**: o processamento consulta o recurso oficial com o token da conta e confirma que o `user_id`
   pertence a uma conta conectada;
5. limitar requisições por IP.

### Concorrência (pesquisa de preços)
Relatos de desenvolvedores indicam 403 em `/sites/MLB/search` e em `/items` de outros vendedores. A aplicação usa somente o
catálogo (`/products/search`, `/products/{id}/items`) com token do vendedor, registra fonte, data e limitações, e não copia
imagens ou descrições de terceiros. Preço observado não é custo do concorrente.

### Tokens
- Cifrados (AES-256-GCM, AAD = id da conta) em `private.marketplace_credentials`, acessados só por funções restritas ao service role.
- Renovação concorrente: lease (`refresh_locked_until`) + compare-and-swap em `token_generation`; quem não obtém o lease aguarda e relê.
- `invalid_grant` na renovação marca a conta como `reauthorization_required`.
- Desconectar apaga os tokens. Revogação no Mercado Livre deve ser feita também pelo vendedor em sua conta (Segurança > Aplicativos conectados).

### Ambiente de testes automatizados
`ML_API_BASE_URL`/`ML_AUTH_BASE_URL` podem apontar para o servidor simulado de testes (`tests/mocks/mercado-livre-server.ts`)
**apenas fora de produção**. Testes que usam o simulador não comprovam integração real e estão identificados como tal.

## Fornecedores
Ver `src/server/integrations/suppliers`. Nenhuma API real de fornecedor está integrada; o adaptador `generic_rest` permanece
não configurado com os passos de ativação documentados.
