import type { SupplierAdapter } from "@/server/integrations/suppliers/types";
import { SupplierNotConfiguredError } from "@/server/integrations/suppliers/types";

/**
 * Fornecedor operado manualmente: dados de oferta vêm do cadastro no próprio sistema e pedidos
 * são encaminhados por fora (e-mail, WhatsApp, portal), com registro do status e do responsável.
 */
export const manualAdapter: SupplierAdapter = {
  key: "manual",
  displayName: "Cadastro manual",
  capabilities: new Set(["get_offer"]),
  isConfigured: () => true,
  activationSteps: () => [],
};

/** Ofertas mantidas por importação de planilhas. Mesmo comportamento operacional do manual. */
export const fileImportAdapter: SupplierAdapter = {
  key: "file_import",
  displayName: "Planilha CSV/Excel",
  capabilities: new Set(["get_offer"]),
  isConfigured: () => true,
  activationSteps: () => [],
};

const GENERIC_REST_STEPS = [
  "Obter do fornecedor: contrato que autorize revenda e despacho direto ao comprador (dropshipping).",
  "Obter documentação oficial da API (autenticação, catálogo, estoque, pedidos, rastreio, limites de requisição).",
  "Obter credenciais de homologação e de produção.",
  "Implementar um adaptador dedicado em src/server/integrations/suppliers/<fornecedor>.ts com as capacidades realmente suportadas.",
  "Cadastrar a fonte em supplier_sources com status 'available' e as capacidades verificadas.",
  "Escrever testes de contrato com respostas reais de homologação antes de habilitar criação de pedidos.",
];

/**
 * Estrutura para fornecedores com API própria. Sem um fornecedor real verificado, não executa chamadas:
 * qualquer uso retorna SupplierNotConfiguredError com os passos de ativação.
 */
export const genericRestAdapter: SupplierAdapter = {
  key: "generic_rest",
  displayName: "API REST de fornecedor (modelo)",
  capabilities: new Set(),
  // Nenhum fornecedor real foi verificado: permanece não configurado até existir um adaptador dedicado.
  isConfigured: () => false,
  activationSteps: () => GENERIC_REST_STEPS,
  async getOffer() {
    throw new SupplierNotConfiguredError("generic_rest", GENERIC_REST_STEPS);
  },
};
