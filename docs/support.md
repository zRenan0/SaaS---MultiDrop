# Suporte e operação

## Canais
Canal oficial de suporte: **a definir pelo proprietário** (e-mail dedicado recomendado). Atualizar `/legal/termos` e `/legal/privacidade`.

## Rotina do operador
1. Acesso ao painel: `pnpm admin:grant email@dominio` (usuário precisa ter conta). Registro em `admin_audit_logs`.
2. Diariamente em `/admin`: erros sem resolução, tarefas esgotadas, fila pronta e contas aguardando reautorização.
3. Tarefa esgotada: ler `last_error`, corrigir a causa (conta, oferta, anúncio) e reprocessar.
4. Conta `reauthorization_required`: orientar o cliente a reconectar em Mercado Livre → Autorizar novamente.
5. Pedido "Requer atenção": item sem anúncio vinculado ou estoque insuficiente; cliente confirma com o fornecedor.

## Atendimento ao cliente
- Coletar: empresa (identificador), horário, tela, código de erro exibido (8 caracteres) — corresponde ao `errorId` nos logs.
- Nunca solicitar senha ou tokens ao cliente.
- Ações que alteram dados do cliente exigem pedido do proprietário da empresa e ficam registradas na auditoria.
