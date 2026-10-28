import { z } from "zod";
import { MlApiError, MlHttpClient } from "@/server/integrations/mercado-livre/http";
import {
  catalogItemsSchema,
  catalogSearchSchema,
  categoryAttributeSchema,
  categorySchema,
  domainDiscoverySchema,
  itemSchema,
  listingPriceSchema,
  listingTypesSchema,
  orderSchema,
  shipmentSchema,
  shippingPreferencesSchema,
  testUserSchema,
  userSchema,
} from "@/server/integrations/mercado-livre/schemas";

/** Operações da API oficial usadas pela aplicação. Cada chamada recebe o token por meio de `getToken`. */
export class MercadoLivreClient {
  constructor(
    private readonly http: MlHttpClient,
    private readonly getToken: () => Promise<string>,
    readonly siteId: string,
    /** Chamado quando a API recusa um token ainda válido (autorização revogada pelo vendedor). */
    private readonly onUnauthorized?: () => Promise<void>,
  ) {}

  private async guard<R>(fn: () => Promise<R>): Promise<R> {
    try {
      return await fn();
    } catch (error) {
      if (error instanceof MlApiError && error.status === 401 && this.onUnauthorized) await this.onUnauthorized();
      throw error;
    }
  }

  private async get<T extends z.ZodType>(path: string, schema: T, query?: Record<string, string | number | undefined>): Promise<z.infer<T>> {
    const { data } = await this.guard(async () => this.http.request<unknown>(path, { accessToken: await this.getToken(), query }));
    return schema.parse(data);
  }

  getMe() {
    return this.get("/users/me", userSchema);
  }

  /** Cria um usuário de teste do Mercado Livre (limite da plataforma: 10 por conta). Não é repetido automaticamente. */
  async createTestUser() {
    const { data } = await this.guard(async () =>
      this.http.request<unknown>("/users/test_user", { method: "POST", json: { site_id: this.siteId }, accessToken: await this.getToken(), retry: false }),
    );
    return testUserSchema.parse(data);
  }

  predictCategory(query: string) {
    return this.get(`/sites/${this.siteId}/domain_discovery/search`, domainDiscoverySchema, { q: query.slice(0, 120), limit: 5 });
  }

  getCategory(categoryId: string) {
    return this.get(`/categories/${encodeURIComponent(categoryId)}`, categorySchema);
  }

  getCategoryAttributes(categoryId: string) {
    return this.get(`/categories/${encodeURIComponent(categoryId)}/attributes`, z.array(categoryAttributeSchema));
  }

  getShippingPreferences(userId: string) {
    return this.get(`/users/${encodeURIComponent(userId)}/shipping_preferences`, shippingPreferencesSchema);
  }

  getAvailableListingTypes(userId: string, categoryId: string) {
    return this.get(`/users/${encodeURIComponent(userId)}/available_listing_types`, listingTypesSchema, { category_id: categoryId });
  }

  async getListingPrice(params: { price: string; listingTypeId: string; categoryId: string }) {
    const data = await this.get(`/sites/${this.siteId}/listing_prices`, z.union([listingPriceSchema, z.array(listingPriceSchema)]), {
      price: params.price,
      listing_type_id: params.listingTypeId,
      category_id: params.categoryId,
    });
    const list = Array.isArray(data) ? data : [data];
    return list.find((entry) => entry.listing_type_id === params.listingTypeId) ?? list[0] ?? null;
  }

  /** Validação oficial sem publicar. Retorna lista vazia quando válido (HTTP 204). */
  async validateItem(payload: Record<string, unknown>) {
    await this.guard(async () => this.http.request("/items/validate", { method: "POST", json: payload, accessToken: await this.getToken(), retry: false }));
  }

  /** Publicação real. Nunca repetida automaticamente (não idempotente). */
  async createItem(payload: Record<string, unknown>) {
    const { data } = await this.guard(async () =>
      this.http.request<unknown>("/items", { method: "POST", json: payload, accessToken: await this.getToken(), retry: false, timeoutMs: 30_000 }),
    );
    return itemSchema.parse(data);
  }

  async setDescription(itemId: string, plainText: string) {
    await this.http.request(`/items/${encodeURIComponent(itemId)}/description`, {
      method: "POST",
      json: { plain_text: plainText },
      accessToken: await this.getToken(),
      retry: false,
    });
  }

  getItem(itemId: string) {
    return this.get(`/items/${encodeURIComponent(itemId)}`, itemSchema);
  }

  /** PUT com valores absolutos é idempotente: pode ser repetido. */
  async updateItem(itemId: string, patch: { price?: number; available_quantity?: number; status?: "active" | "paused" | "closed" }) {
    const { data } = await this.guard(async () =>
      this.http.request<unknown>(`/items/${encodeURIComponent(itemId)}`, { method: "PUT", json: patch, accessToken: await this.getToken(), retry: true }),
    );
    return itemSchema.parse(data);
  }

  async findItemsBySellerSku(userId: string, sku: string): Promise<string[]> {
    const data = await this.get(`/users/${encodeURIComponent(userId)}/items/search`, z.object({ results: z.array(z.string()).default([]) }), { seller_sku: sku });
    return data.results;
  }

  getOrder(orderId: string) {
    return this.get(`/orders/${encodeURIComponent(orderId)}`, orderSchema);
  }

  async searchRecentOrders(sellerId: string, limit = 50) {
    const data = await this.get("/orders/search", z.object({ results: z.array(orderSchema).default([]) }), { seller: sellerId, sort: "date_desc", limit });
    return data.results;
  }

  getShipment(shipmentId: string) {
    return this.get(`/shipments/${encodeURIComponent(shipmentId)}`, shipmentSchema);
  }

  searchCatalogProducts(query: string) {
    return this.get("/products/search", catalogSearchSchema, { site_id: this.siteId, q: query.slice(0, 120), status: "active" });
  }

  getCatalogProductItems(productId: string) {
    return this.get(`/products/${encodeURIComponent(productId)}/items`, catalogItemsSchema);
  }
}
