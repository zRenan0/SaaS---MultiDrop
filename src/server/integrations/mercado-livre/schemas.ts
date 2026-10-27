import { z } from "zod";

/** Esquemas tolerantes: validam apenas os campos usados e ignoram o restante. */
export const tokenResponseSchema = z.object({
  access_token: z.string().min(10),
  token_type: z.string().optional(),
  expires_in: z.number().int().positive(),
  scope: z.string().optional().default(""),
  user_id: z.union([z.number(), z.string()]).transform(String),
  refresh_token: z.string().min(10).optional(),
});
export type TokenResponse = z.infer<typeof tokenResponseSchema>;

export const userSchema = z.object({
  id: z.union([z.number(), z.string()]).transform(String),
  nickname: z.string(),
  site_id: z.string().optional(),
  tags: z.array(z.string()).optional().default([]),
});
export type MlUser = z.infer<typeof userSchema>;

export const domainDiscoverySchema = z.array(
  z.object({
    domain_id: z.string().optional(),
    domain_name: z.string().optional(),
    category_id: z.string(),
    category_name: z.string(),
  }),
);

export const categorySchema = z.object({
  id: z.string(),
  name: z.string(),
  path_from_root: z.array(z.object({ id: z.string(), name: z.string() })).optional().default([]),
  settings: z.record(z.string(), z.unknown()).optional(),
});

export const categoryAttributeSchema = z.object({
  id: z.string(),
  name: z.string(),
  value_type: z.string().optional(),
  tags: z.record(z.string(), z.unknown()).optional().default({}),
  values: z.array(z.object({ id: z.string(), name: z.string() })).optional().default([]),
  hint: z.string().optional(),
  allowed_units: z.array(z.object({ id: z.string(), name: z.string() })).optional(),
});
export type MlCategoryAttribute = z.infer<typeof categoryAttributeSchema>;

export const listingTypesSchema = z.object({
  available: z.array(z.object({ id: z.string(), name: z.string() })).optional().default([]),
});

export const listingPriceSchema = z.object({
  listing_type_id: z.string(),
  listing_type_name: z.string().optional(),
  currency_id: z.string().optional(),
  sale_fee_amount: z.number().nullable().optional(),
  listing_fee_amount: z.number().nullable().optional(),
  sale_fee_details: z
    .object({
      percentage_fee: z.number().nullable().optional(),
      fixed_fee: z.number().nullable().optional(),
      gross_amount: z.number().nullable().optional(),
      meli_percentage_fee: z.number().nullable().optional(),
    })
    .partial()
    .optional(),
});
export type MlListingPrice = z.infer<typeof listingPriceSchema>;

export const itemSchema = z.object({
  id: z.string(),
  title: z.string().optional(),
  family_name: z.string().nullable().optional(),
  user_product_id: z.string().nullable().optional(),
  status: z.string(),
  price: z.number().nullable().optional(),
  available_quantity: z.number().nullable().optional(),
  permalink: z.string().nullable().optional(),
  seller_id: z.union([z.number(), z.string()]).transform(String).optional(),
  category_id: z.string().optional(),
  listing_type_id: z.string().optional(),
  sub_status: z.array(z.string()).optional(),
  tags: z.array(z.string()).optional(),
});
export type MlItem = z.infer<typeof itemSchema>;

export const orderSchema = z.object({
  id: z.union([z.number(), z.string()]).transform(String),
  status: z.string(),
  date_created: z.string().optional(),
  total_amount: z.number(),
  currency_id: z.string().optional().default("BRL"),
  pack_id: z.union([z.number(), z.string()]).nullable().optional().transform((v) => (v == null ? null : String(v))),
  seller: z.object({ id: z.union([z.number(), z.string()]).transform(String) }),
  buyer: z.object({ id: z.union([z.number(), z.string()]).transform(String).optional(), nickname: z.string().optional() }).optional(),
  shipping: z.object({ id: z.union([z.number(), z.string()]).nullable().optional() }).nullable().optional(),
  tags: z.array(z.string()).optional().default([]),
  order_items: z.array(
    z.object({
      item: z.object({
        id: z.string(),
        title: z.string().optional(),
        seller_sku: z.string().nullable().optional(),
        variation_id: z.union([z.number(), z.string()]).nullable().optional(),
      }),
      quantity: z.number().int(),
      unit_price: z.number(),
      sale_fee: z.number().nullable().optional(),
    }),
  ),
});
export type MlOrder = z.infer<typeof orderSchema>;

export const notificationSchema = z.object({
  _id: z.string().max(100).optional(),
  resource: z.string().min(1).max(300).regex(/^\/[A-Za-z0-9_/\-.?=&]+$/),
  user_id: z.union([z.number(), z.string()]).transform(String),
  topic: z.string().min(1).max(60),
  application_id: z.union([z.number(), z.string()]).transform(String),
  attempts: z.number().int().nonnegative().optional(),
  sent: z.string().optional(),
  received: z.string().optional(),
});
export type MlNotification = z.infer<typeof notificationSchema>;

export const catalogSearchSchema = z.object({
  results: z
    .array(z.object({ id: z.string(), name: z.string(), status: z.string().optional(), domain_id: z.string().optional() }))
    .default([]),
});

export const catalogItemsSchema = z.object({
  results: z
    .array(
      z.object({
        item_id: z.string(),
        seller_id: z.union([z.number(), z.string()]).transform(String).optional(),
        price: z.number(),
        currency_id: z.string().optional(),
        listing_type_id: z.string().optional(),
        shipping: z.object({ free_shipping: z.boolean().optional() }).partial().optional(),
      }),
    )
    .default([]),
});
