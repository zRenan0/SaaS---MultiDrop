import type { Metadata } from "next";
import { appConfig } from "@/lib/app-config";

export const metadata: Metadata = { title: "Termos de uso" };

export default function TermsPage() {
  return (
    <>
      <h1>Termos de uso</h1>
      <h2>1. Objeto</h2>
      <p>
        O {appConfig.name} é uma ferramenta de gestão operacional para vendedores que anunciam no Mercado Livre produtos
        fornecidos por terceiros. A plataforma não é afiliada, parceira oficial ou representante do Mercado Livre nem dos
        fornecedores cadastrados.
      </p>
      <h2>2. Responsabilidades do vendedor</h2>
      <ul>
        <li>O vendedor conectado é responsável pela própria conta, anúncios, preços, atendimento, obrigações fiscais e entregas.</li>
        <li>Cabe ao vendedor obter autorização do fornecedor para despacho direto (dropshipping) e para uso de imagens e descrições.</li>
        <li>O vendedor deve cumprir as políticas do Mercado Livre e a legislação aplicável, incluindo o Código de Defesa do Consumidor.</li>
      </ul>
      <h2>3. Cálculos e estimativas</h2>
      <p>
        Lucro, tarifas e tributos exibidos são estimativas baseadas nos parâmetros informados e nas fontes indicadas com data.
        Não constituem apuração fiscal nem garantia de resultado. Confirme o enquadramento tributário com seu contador.
      </p>
      <h2>4. Integrações</h2>
      <p>
        Operações externas (publicar anúncios, consultar pedidos, enviar pedidos a fornecedores) só ocorrem com integrações
        configuradas e confirmação do usuário. Indisponibilidades de terceiros podem afetar o serviço.
      </p>
      <h2>5. Planos e cobrança</h2>
      <p>Planos, limites e valores são informados na área Plano e uso. Nenhuma cobrança é realizada sem provedor de pagamento configurado e aceite do cliente.</p>
      <h2>6. Suporte</h2>
      <p>Canal de suporte: a definir pelo operador do serviço antes do lançamento comercial.</p>
    </>
  );
}
