// Servidor SIMULADO do Mercado Livre, usado SOMENTE em testes automatizados.
// Respostas imitam o formato documentado; valores (tarifas, IDs) são fictícios e não representam a API real.
import { createHash, randomBytes } from "node:crypto";
import { createServer } from "node:http";

const PORT = Number(process.env.MOCK_ML_PORT ?? 4010);
const CLIENT_ID = "mock-client";
const CLIENT_SECRET = "mock-secret";
// Usuário que "autoriza" o próximo fluxo OAuth; os testes podem trocá-lo via POST /__mock/next-user.
let nextUser = { id: 900001, nickname: "VENDEDOR_TESTE_MOCK", site_id: "MLB", tags: ["normal"] };

const codes = new Map(); // code -> { challenge, redirectUri }
const accessTokens = new Map(); // token -> usuário
const refreshTokens = new Map();
const items = new Map();
const orders = new Map();
let itemSeq = 9000000000;

function send(res, status, body) {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(body === undefined ? "" : JSON.stringify(body));
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return Buffer.concat(chunks).toString("utf8");
}

function issueTokens(user) {
  const access = `APP_USR-mock-${randomBytes(12).toString("hex")}`;
  const refresh = `TG-mock-${randomBytes(12).toString("hex")}`;
  accessTokens.set(access, user);
  refreshTokens.set(refresh, user);
  return { access_token: access, token_type: "Bearer", expires_in: 21600, scope: "offline_access read write", user_id: user.id, refresh_token: refresh };
}

function userFor(req) {
  const header = req.headers.authorization ?? "";
  return accessTokens.get(header.replace(/^Bearer /, "")) ?? null;
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const path = url.pathname;

  if (path === "/health") return send(res, 200, { ok: true });
  if (path === "/__mock/next-user" && req.method === "POST") {
    nextUser = { site_id: "MLB", tags: ["normal"], ...JSON.parse(await readBody(req)) };
    return send(res, 200, nextUser);
  }

  // Cria um item já existente (anúncio semeado pelo teste) e pedidos simulados.
  if (path === "/__mock/items" && req.method === "POST") {
    const item = JSON.parse(await readBody(req));
    items.set(item.id, { status: "active", permalink: null, ...item });
    return send(res, 201, items.get(item.id));
  }
  if (path === "/__mock/orders" && req.method === "POST") {
    const order = JSON.parse(await readBody(req));
    orders.set(String(order.id), order);
    return send(res, 201, order);
  }

  if (path === "/authorization" && req.method === "GET") {
    if (url.searchParams.get("client_id") !== CLIENT_ID) return send(res, 400, { error: "invalid_client" });
    const code = `TG-code-${randomBytes(8).toString("hex")}`;
    codes.set(code, { challenge: url.searchParams.get("code_challenge"), redirectUri: url.searchParams.get("redirect_uri"), user: nextUser });
    const target = new URL(url.searchParams.get("redirect_uri"));
    target.searchParams.set("code", code);
    target.searchParams.set("state", url.searchParams.get("state") ?? "");
    res.writeHead(302, { location: target.toString() });
    return res.end();
  }

  if (path === "/oauth/token" && req.method === "POST") {
    const form = new URLSearchParams(await readBody(req));
    if (form.get("client_id") !== CLIENT_ID || form.get("client_secret") !== CLIENT_SECRET) return send(res, 401, { error: "invalid_client" });
    if (form.get("grant_type") === "authorization_code") {
      const entry = codes.get(form.get("code"));
      if (!entry || entry.redirectUri !== form.get("redirect_uri")) return send(res, 400, { error: "invalid_grant", message: "code inválido" });
      const verifier = form.get("code_verifier") ?? "";
      if (entry.challenge && createHash("sha256").update(verifier).digest("base64url") !== entry.challenge) {
        return send(res, 400, { error: "invalid_grant", message: "code_verifier inválido" });
      }
      codes.delete(form.get("code"));
      return send(res, 200, issueTokens(entry.user));
    }
    if (form.get("grant_type") === "refresh_token") {
      const rt = form.get("refresh_token");
      const user = refreshTokens.get(rt);
      if (!user) return send(res, 400, { error: "invalid_grant" });
      refreshTokens.delete(rt); // uso único
      return send(res, 200, issueTokens(user));
    }
    return send(res, 400, { error: "unsupported_grant_type" });
  }

  const user = userFor(req);
  if (!user) return send(res, 401, { error: "invalid_token", message: "invalid access token" });

  if (path === "/users/me") return send(res, 200, user);
  if (path === "/users/test_user" && req.method === "POST") {
    const body = JSON.parse(await readBody(req));
    if (body.site_id !== "MLB") return send(res, 400, { error: "bad_request", message: "invalid site_id" });
    return send(res, 201, { id: 999000111, nickname: "TESTMOCK123", password: "senha-simulada", site_status: "active", email: "test_user_mock@testuser.com" });
  }
  if (path === "/sites/MLB/domain_discovery/search") {
    return send(res, 200, [{ domain_id: "MLB-SPEAKERS", domain_name: "Caixas de som", category_id: "MLB1234", category_name: "Caixas de Som (simulado)" }]);
  }
  if (path === "/categories/MLB1234/attributes") {
    return send(res, 200, [
      { id: "BRAND", name: "Marca", value_type: "string", tags: { required: true } },
      { id: "MODEL", name: "Modelo", value_type: "string", tags: { required: true } },
      { id: "GTIN", name: "Código universal de produto", value_type: "string", tags: { conditional_required: true } },
      { id: "EMPTY_GTIN_REASON", name: "Motivo de GTIN vazio", value_type: "list", tags: { hidden: true }, values: [{ id: "17055160", name: "O produto não tem código cadastrado" }] },
      { id: "COLOR", name: "Cor", value_type: "list", tags: {}, values: [{ id: "52049", name: "Preto" }, { id: "52055", name: "Branco" }] },
    ]);
  }
  if (/^\/users\/\d+\/available_listing_types$/.test(path)) {
    return send(res, 200, { available: [{ id: "gold_special", name: "Clássico" }, { id: "gold_pro", name: "Premium" }] });
  }
  if (path === "/sites/MLB/listing_prices") {
    const price = Number(url.searchParams.get("price"));
    return send(res, 200, {
      listing_type_id: url.searchParams.get("listing_type_id"),
      currency_id: "BRL",
      sale_fee_amount: Math.round(price * 0.115 * 100) / 100,
      sale_fee_details: { percentage_fee: 11.5, fixed_fee: 0, gross_amount: Math.round(price * 0.115 * 100) / 100 },
    });
  }
  if (path === "/items/validate" && req.method === "POST") {
    const body = JSON.parse(await readBody(req));
    const ids = (body.attributes ?? []).map((a) => a.id);
    if (!ids.includes("MODEL")) {
      return send(res, 400, { error: "validation_error", message: "Validation error", cause: [{ code: "item.attributes.missing_required", message: "The attributes [MODEL] are required for category MLB1234", type: "error" }] });
    }
    if (!ids.includes("GTIN") && !ids.includes("EMPTY_GTIN_REASON")) {
      return send(res, 400, { error: "validation_error", message: "Validation error", cause: [{ code: "item.attributes.missing_required", message: "The attributes [GTIN] are required for category [MLB1234]. Check the attribute is present in the attributes list or in all variation's attributes_combination or attributes.", type: "error" }] });
    }
    res.writeHead(204);
    return res.end();
  }
  if (path === "/items" && req.method === "POST") {
    const body = JSON.parse(await readBody(req));
    const id = `MLB${++itemSeq}`;
    const item = {
      id,
      title: body.title ?? body.family_name,
      family_name: body.family_name ?? null,
      user_product_id: null,
      status: "active",
      price: body.price,
      available_quantity: body.available_quantity,
      permalink: `https://produto.mercadolivre.com.br/${id.replace("MLB", "MLB-")}-simulado`,
      seller_id: user.id,
      category_id: body.category_id,
      listing_type_id: body.listing_type_id,
      attributes: body.attributes,
    };
    items.set(id, item);
    return send(res, 201, item);
  }
  const orderMatch = /^\/orders\/(\d+)$/.exec(path);
  if (orderMatch) {
    const order = orders.get(orderMatch[1]);
    if (!order) return send(res, 404, { error: "not_found" });
    if (String(order.seller.id) !== String(user.id)) return send(res, 403, { error: "forbidden", message: "order belongs to another seller" });
    return send(res, 200, order);
  }
  if (path === "/orders/search") {
    const results = [...orders.values()].filter((o) => String(o.seller.id) === String(user.id));
    return send(res, 200, { results, paging: { total: results.length } });
  }
  const shipmentMatch = /^\/shipments\/(\d+)$/.exec(path);
  if (shipmentMatch) return send(res, 200, { id: Number(shipmentMatch[1]), status: "ready_to_ship", substatus: null, tracking_number: null });
  const descriptionMatch = /^\/items\/(MLB\d+)\/description$/.exec(path);
  if (descriptionMatch && req.method === "POST") return send(res, 201, { plain_text: "ok" });
  const itemMatch = /^\/items\/(MLB\d+)$/.exec(path);
  if (itemMatch) {
    const item = items.get(itemMatch[1]);
    if (!item) return send(res, 404, { error: "not_found" });
    if (req.method === "PUT") Object.assign(item, JSON.parse(await readBody(req)));
    return send(res, 200, item);
  }
  return send(res, 404, { error: "not_found", message: `rota simulada inexistente: ${path}` });
});

server.listen(PORT, () => console.log(`Mercado Livre SIMULADO em http://localhost:${PORT}`));
