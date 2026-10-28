export const PRODUCT_IMAGE_BUCKET = "product-images";
export const PRODUCT_IMAGE_MAX_BYTES = 10 * 1024 * 1024;
export const PRODUCT_IMAGE_MAX_COUNT = 10;
export const PRODUCT_IMAGE_TYPES = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" } as const;

/** Formato de cada item em catalog_products.images. `path` só existe para arquivos enviados ao Storage. */
export type ProductImage = { url: string; authorized?: boolean; source?: string; path?: string };
