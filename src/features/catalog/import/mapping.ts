import { normalizeText } from "@/features/catalog/normalize";

/** Campos canônicos aceitos na importação. */
export const IMPORT_FIELDS = {
  title: { label: "Título", required: true, synonyms: ["titulo", "nome", "produto", "nome do produto", "descricao curta", "title", "name"] },
  sku: { label: "SKU do fornecedor", required: true, synonyms: ["sku", "codigo", "cod", "codigo do produto", "referencia", "ref", "part number"] },
  cost: { label: "Custo", required: true, synonyms: ["custo", "preco de custo", "preco custo", "valor", "preco", "custo unitario", "cost", "price"] },
  stock: { label: "Estoque", required: true, synonyms: ["estoque", "quantidade", "qtd", "qtde", "saldo", "disponivel", "stock", "quantity"] },
  brand: { label: "Marca", required: false, synonyms: ["marca", "fabricante", "brand"] },
  model: { label: "Modelo", required: false, synonyms: ["modelo", "model"] },
  gtin: { label: "GTIN/EAN", required: false, synonyms: ["gtin", "ean", "ean13", "codigo de barras", "cod barras", "upc"] },
  category: { label: "Categoria", required: false, synonyms: ["categoria", "category", "departamento"] },
  description: { label: "Descrição", required: false, synonyms: ["descricao", "descricao completa", "description", "detalhes"] },
  handlingTimeDays: { label: "Prazo de despacho (dias)", required: false, synonyms: ["prazo", "prazo de despacho", "prazo de envio", "dias para envio", "handling time"] },
  inboundShippingCost: { label: "Frete de entrada", required: false, synonyms: ["frete de entrada", "frete entrada", "frete fornecedor"] },
  handlingFee: { label: "Taxa de preparação/despacho", required: false, synonyms: ["taxa de despacho", "taxa de preparacao", "taxa de manuseio", "handling fee"] },
  imageUrls: { label: "URLs das imagens", required: false, synonyms: ["imagens", "imagem", "fotos", "foto", "url imagem", "images", "image"] },
  externalOfferId: { label: "ID da oferta no fornecedor", required: false, synonyms: ["id fornecedor", "id oferta", "id externo", "external id"] },
} as const;

export type ImportField = keyof typeof IMPORT_FIELDS;
export const IMPORT_FIELD_KEYS = Object.keys(IMPORT_FIELDS) as ImportField[];
export const REQUIRED_IMPORT_FIELDS = IMPORT_FIELD_KEYS.filter((k) => IMPORT_FIELDS[k].required);

/** Mapeamento: campo canônico -> índice da coluna no arquivo. */
export type ColumnMapping = Partial<Record<ImportField, number>>;

export function suggestMapping(headers: string[]): ColumnMapping {
  const mapping: ColumnMapping = {};
  const used = new Set<number>();
  const normalized = headers.map((h) => normalizeText(h));
  // Primeiro correspondências exatas, depois parciais, para evitar que "preco" capture "preco de custo".
  for (const pass of ["exact", "partial"] as const) {
    for (const field of IMPORT_FIELD_KEYS) {
      if (mapping[field] !== undefined) continue;
      const synonyms: readonly string[] = IMPORT_FIELDS[field].synonyms;
      const index = normalized.findIndex(
        (h, i) => !used.has(i) && h !== "" && (pass === "exact" ? synonyms.includes(h) : synonyms.some((s) => h.includes(s))),
      );
      if (index >= 0) {
        mapping[field] = index;
        used.add(index);
      }
    }
  }
  return mapping;
}

export function missingRequiredFields(mapping: ColumnMapping): ImportField[] {
  return REQUIRED_IMPORT_FIELDS.filter((field) => mapping[field] === undefined);
}
