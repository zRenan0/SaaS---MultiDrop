import type { Metadata } from "next";

export const metadata: Metadata = { title: "Política de privacidade" };

export default function PrivacyPage() {
  return (
    <>
      <h1>Política de privacidade</h1>
      <h2>Dados tratados</h2>
      <ul>
        <li>Conta: nome, e-mail e credenciais de acesso (senha armazenada pelo provedor de autenticação, nunca em texto puro).</li>
        <li>Empresa: dados cadastrais, membros e papéis, catálogo, custos e configurações de preço.</li>
        <li>Integrações: identificador e apelido da conta do Mercado Livre e tokens de acesso cifrados.</li>
        <li>Pedidos: dados mínimos necessários para operar a venda (identificadores, itens, valores, apelido do comprador e status).</li>
      </ul>
      <h2>Finalidade e base legal</h2>
      <p>Execução do contrato com o cliente e legítimo interesse na segurança e prevenção a fraudes (LGPD, art. 7º, V e IX). A validação jurídica das bases legais está pendente.</p>
      <h2>Compartilhamento</h2>
      <p>Dados são enviados ao Mercado Livre e aos fornecedores somente para executar operações solicitadas pelo cliente.</p>
      <h2>Retenção e exclusão</h2>
      <p>Dados permanecem enquanto a conta estiver ativa. Ao desconectar uma integração, os tokens são apagados. A exclusão da empresa remove os dados vinculados, exceto registros que precisem ser mantidos por obrigação legal.</p>
      <h2>Direitos do titular</h2>
      <p>Acesso, correção, portabilidade e exclusão podem ser solicitados pelo canal de suporte (a definir antes do lançamento).</p>
      <h2>Segurança</h2>
      <p>Isolamento por empresa no banco de dados, tokens cifrados com chave externa ao banco, auditoria de ações sensíveis e acesso administrativo restrito.</p>
    </>
  );
}
