import { describe, expect, it } from "vitest";
import { buildItemPayload, mlCausesToIssues, requiredAttributesFromCategory, validateDraftLocally, type DraftForPayload } from "@/features/listings/payload";

const draft = (over: Partial<DraftForPayload> = {}): DraftForPayload => ({
  title: "Caixa de Som Bluetooth 10W",
  familyName: "Caixa de Som Bluetooth ACME",
  categoryId: "MLB1234",
  listingTypeId: "gold_special",
  condition: "new",
  attributes: [
    { id: "BRAND", name: "Marca", value_name: "ACME" },
    { id: "MODEL", name: "Modelo", value_name: "" },
    { id: "COLOR", value_id: "52049" },
  ],
  pictures: [{ url: "https://cdn.exemplo.com.br/a.jpg", authorized: true }],
  price: "124.62",
  stock: 5,
  sellerSku: "CX-1",
  ...over,
});

const ctx = {
  hasAccount: true,
  accountActive: true,
  userProductSeller: false,
  offerStatus: "active",
  offerStock: 8,
  requiredAttributes: [{ id: "BRAND", name: "Marca" }],
};

describe("payload de publicação", () => {
  it("modelo clássico envia title e não envia family_name", () => {
    const payload = buildItemPayload(draft(), { userProductSeller: false, currencyId: "BRL" });
    expect(payload.title).toBe("Caixa de Som Bluetooth 10W");
    expect(payload).not.toHaveProperty("family_name");
    expect(payload).not.toHaveProperty("variations");
    expect(payload).toMatchObject({ category_id: "MLB1234", price: 124.62, currency_id: "BRL", available_quantity: 5, buying_mode: "buy_it_now", listing_type_id: "gold_special" });
    expect(payload.pictures).toEqual([{ source: "https://cdn.exemplo.com.br/a.jpg" }]);
    expect(payload.attributes).toEqual([
      { id: "BRAND", value_name: "ACME" },
      { id: "COLOR", value_id: "52049" },
      { id: "SELLER_SKU", value_name: "CX-1" },
    ]);
  });

  it("modelo User Products envia family_name e não envia title", () => {
    const payload = buildItemPayload(draft(), { userProductSeller: true, currencyId: "BRL" });
    expect(payload.family_name).toBe("Caixa de Som Bluetooth ACME");
    expect(payload).not.toHaveProperty("title");
  });
});

describe("validação local do rascunho", () => {
  it("aceita rascunho completo", () => {
    expect(validateDraftLocally(draft(), ctx)).toEqual([]);
  });

  it("aponta todos os problemas relevantes", () => {
    const issues = validateDraftLocally(
      draft({ title: "", categoryId: null, price: "0", stock: 20, pictures: [{ url: "http://x.com/a.jpg", authorized: true }, { url: "https://cdn.x.com/b.jpg", authorized: false }], attributes: [] }),
      { ...ctx, offerStatus: "paused", requiredAttributes: [{ id: "BRAND", name: "Marca" }] },
    );
    const messages = issues.map((i) => i.message);
    expect(messages).toEqual(
      expect.arrayContaining([
        "Informe o título do anúncio.",
        "Selecione a categoria.",
        "Informe o preço de venda.",
        "A oferta do fornecedor não está ativa.",
        "O estoque anunciado (20) excede o disponível no fornecedor (8).",
        "Há fotos com confirmação de uso pendente. Confirme na seção Fotos.",
        "Atributo obrigatório: Marca.",
      ]),
    );
    expect(messages.some((m) => m.startsWith("Imagem com URL inválida"))).toBe(true);
  });

  it("exige family_name para vendedor User Products e limita tamanho", () => {
    const issues = validateDraftLocally(draft({ familyName: "" }), { ...ctx, userProductSeller: true });
    expect(issues.map((i) => i.field)).toContain("family_name");
    const long = validateDraftLocally(draft({ title: "x".repeat(61) }), ctx);
    expect(long[0].message).toMatch(/60 caracteres/);
  });

  it("exige conta ativa e modelo identificado", () => {
    expect(validateDraftLocally(draft(), { ...ctx, hasAccount: false }).map((i) => i.field)).toContain("marketplace_account_id");
    expect(validateDraftLocally(draft(), { ...ctx, userProductSeller: null }).map((i) => i.message).join()).toMatch(/modelo de publicação/);
  });
});

describe("respostas do Mercado Livre", () => {
  it("converte causas ignorando avisos", () => {
    expect(
      mlCausesToIssues(
        [
          { code: "item.attributes.missing_required", message: "The attributes [BRAND] are required", type: "error" },
          { code: "item.title.length", message: "aviso", type: "warning" },
        ],
        "inválido",
      ),
    ).toEqual([{ field: "item.attributes.missing_required", message: "The attributes [BRAND] are required", source: "mercado_livre" }]);
    expect(mlCausesToIssues([], "Falha")).toEqual([{ field: "mercado_livre", message: "Falha", source: "mercado_livre" }]);
  });

  it("identifica atributos obrigatórios pela tag", () => {
    expect(
      requiredAttributesFromCategory([
        { id: "BRAND", name: "Marca", tags: { required: true } },
        { id: "GTIN", name: "Código universal", tags: { catalog_required: true } },
        { id: "COLOR", name: "Cor", tags: {} },
      ]),
    ).toEqual([
      { id: "BRAND", name: "Marca" },
      { id: "GTIN", name: "Código universal" },
    ]);
  });
});
