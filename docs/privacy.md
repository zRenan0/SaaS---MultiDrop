# Privacidade e tratamento de dados

> Base técnica. Não constitui parecer jurídico nem certifica conformidade com a LGPD; requer revisão por assessoria jurídica.

## Dados tratados e minimização
| Categoria | Onde | Observação |
|---|---|---|
| Conta (nome, e-mail) | Supabase Auth, `profiles` | Senha gerida pelo Supabase Auth (hash), nunca pela aplicação |
| Empresa, membros, papéis | `organizations`, `organization_members` | |
| Catálogo, custos, preços | tabelas de catálogo e precificação | Dados comerciais do cliente |
| Tokens do Mercado Livre | `private.marketplace_credentials` | Cifrados (AES-256-GCM); apagados ao desconectar |
| Pedidos | `orders`, `order_items` | Apenas apelido do comprador e IDs; **endereço não é armazenado** |
| Notificações | `webhook_events` | Referência ao recurso; sem dados pessoais |
| Auditoria | `audit_logs`, `admin_audit_logs` | Metadados sem segredos |

## Retenção (proposta, a validar)
- Dados da empresa: enquanto a conta estiver ativa.
- `webhook_events` e `sync_jobs` concluídos: 90 dias (rotina de limpeza a implementar com aprovação do proprietário).
- `rate_limit_buckets`: 1 dia (limpeza automática).
- Auditoria: 5 anos (prazo a confirmar com assessoria jurídica).

## Direitos do titular
- Exportação: proprietário da empresa baixa todos os dados em JSON em Configurações → Dados da empresa (`/app/settings/export`).
- Correção: pelas telas da aplicação.
- Exclusão: solicitada ao suporte. Procedimento do operador: suspender a empresa no `/admin`, exportar se solicitado, desconectar contas
  (apaga tokens) e excluir a organização via SQL (`delete from public.organizations where id = ...`; as tabelas têm `on delete cascade`).
  Registrar em `admin_audit_logs`. Exclusão de usuário: Supabase Auth (remove perfil e associações em cascata).

## Integrações
- Desconectar uma conta apaga os tokens. O vendedor deve revogar também o aplicativo no Mercado Livre.
- Dados só são enviados ao Mercado Livre/fornecedores para executar operações solicitadas.

## Incidentes
Ver `docs/security.md` (Resposta a incidentes). Comunicação à ANPD e aos titulares conforme avaliação jurídica.

## Pendências
Revisão jurídica dos termos, política de privacidade, bases legais, prazos de retenção e contrato de operador de dados (DPA).
