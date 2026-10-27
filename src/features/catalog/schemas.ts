import { z } from "zod";
import { parseBrlAmount } from "@/lib/money";
import { isDangerousCell, isSafePublicUrl, isValidGtin } from "@/features/catalog/normalize";

const safeText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Máximo de ${max} caracteres.`)
    .refine((v) => !isDangerousCell(v), "Conteúdo não permitido (fórmula ou caractere de controle).");

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => (v ? v : undefined))
    .refine((v) => v === undefined || !isDangerousCell(v), "Conteúdo não permitido (fórmula ou caractere de controle).");

export const moneyString = (label: string, { required = true } = {}) =>
  z
    .union([z.string(), z.number()])
    .optional()
    .transform((v, ctx) => {
      if (v === undefined || v === "") {
        if (required) ctx.addIssue({ code: "custom", message: `Informe ${label}.` });
        return required ? z.NEVER : "0";
      }
      const parsed = parseBrlAmount(v);
      if (!parsed || parsed.isNegative()) {
        ctx.addIssue({ code: "custom", message: `${label} inválido.` });
        return z.NEVER;
      }
      if (parsed.greaterThan("99999999.99")) {
        ctx.addIssue({ code: "custom", message: `${label} muito alto.` });
        return z.NEVER;
      }
      return parsed.toDecimalPlaces(2).toFixed(2);
    });

function parseInteger(v: string | number): number {
  return typeof v === "number" ? v : Number(String(v).trim().replace(/\.(?=\d{3}\b)/g, ""));
}

export const intString = (label: string, { min = 0, max = 1_000_000 } = {}) =>
  z.union([z.string(), z.number()]).optional().transform((v, ctx) => {
    if (v === undefined || v === "") {
      ctx.addIssue({ code: "custom", message: `Informe ${label}.` });
      return z.NEVER;
    }
    const n = parseInteger(v);
    if (!Number.isInteger(n) || n < min || n > max) {
      ctx.addIssue({ code: "custom", message: `${label} deve ser um número inteiro entre ${min} e ${max}.` });
      return z.NEVER;
    }
    return n;
  });

export const optionalIntString = (label: string, { min = 0, max = 1_000_000 } = {}) =>
  z.union([z.string(), z.number()]).optional().transform((v, ctx) => {
    if (v === undefined || v === "") return undefined;
    const n = parseInteger(v);
    if (!Number.isInteger(n) || n < min || n > max) {
      ctx.addIssue({ code: "custom", message: `${label} deve ser um número inteiro entre ${min} e ${max}.` });
      return z.NEVER;
    }
    return n;
  });

export const gtinSchema = z
  .string()
  .trim()
  .optional()
  .transform((v) => (v ? v.replace(/[\s-]/g, "") : undefined))
  .refine((v) => v === undefined || isValidGtin(v), "GTIN/EAN inválido (verifique o dígito verificador).");

export const imageUrlsSchema = z
  .union([z.string(), z.array(z.string())])
  .optional()
  .transform((v) => {
    if (!v) return [];
    const list = Array.isArray(v) ? v : v.split(/[\s,;|]+/);
    return list.map((s) => s.trim()).filter(Boolean);
  })
  .refine((list) => list.length <= 12, "Máximo de 12 imagens.")
  .refine((list) => list.every(isSafePublicUrl), "Imagens devem ser URLs https públicas.");

/** Campos de produto + oferta comuns ao cadastro manual e à importação. */
export const productOfferSchema = z.object({
  title: safeText(255).pipe(z.string().min(3, "Título deve ter ao menos 3 caracteres.")),
  brand: optionalText(120),
  model: optionalText(120),
  category: optionalText(200),
  description: optionalText(50000),
  gtin: gtinSchema,
  sku: safeText(100).pipe(z.string().min(1, "Informe o SKU do fornecedor.")),
  externalOfferId: optionalText(120),
  cost: moneyString("o custo"),
  inboundShippingCost: moneyString("o frete de entrada", { required: false }),
  handlingFee: moneyString("a taxa de preparação", { required: false }),
  stock: intString("o estoque", { max: 1_000_000 }),
  handlingTimeDays: optionalIntString("o prazo de despacho", { max: 90 }),
  imageUrls: imageUrlsSchema,
  imagesAuthorized: z
    .union([z.boolean(), z.string()])
    .optional()
    .transform((v) => v === true || v === "on" || v === "true"),
});
export type ProductOfferInput = z.infer<typeof productOfferSchema>;

export const createProductSchema = productOfferSchema.extend({ supplierConnectionId: z.uuid("Selecione o fornecedor.") });

export const updateOfferSchema = z.object({
  offerId: z.uuid(),
  version: z.coerce.number().int().positive(),
  cost: moneyString("o custo"),
  inboundShippingCost: moneyString("o frete de entrada", { required: false }),
  handlingFee: moneyString("a taxa de preparação", { required: false }),
  stock: intString("o estoque", { max: 1_000_000 }),
  handlingTimeDays: optionalIntString("o prazo de despacho", { max: 90 }),
  status: z.enum(["active", "paused", "out_of_stock", "discontinued"]),
});

export const supplierConnectionSchema = z.object({
  supplierSourceId: z.uuid("Selecione o tipo de fornecedor."),
  displayName: safeText(120).pipe(z.string().min(2, "Informe o nome do fornecedor.")),
  contactName: optionalText(120),
  contactEmail: z.union([z.email("E-mail inválido."), z.literal("")]).optional(),
  contactPhone: optionalText(40),
  website: z
    .string()
    .trim()
    .optional()
    .refine((v) => !v || isSafePublicUrl(v), "Use uma URL https pública."),
  notes: optionalText(2000),
  dropshipAgreementConfirmed: z
    .union([z.boolean(), z.string()])
    .optional()
    .transform((v) => v === true || v === "on" || v === "true"),
});
