import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { admin, createOrg, createUser, type TestUser } from "./helpers";
import { getUsage } from "@/features/billing/service";
import { jobHandlers } from "@/server/jobs/handlers";
import { createEnqueue } from "@/server/jobs/enqueue";

describe("planos, uso e suspensão (banco real)", () => {
  let owner: TestUser;
  let org: string;

  beforeAll(async () => {
    owner = await createUser("plano");
    org = await createOrg(owner, "Org Plano");
  });

  afterAll(async () => {
    await admin.from("organizations").update({ status: "active" }).eq("id", org);
  });

  it("assinatura de desenvolvimento troca o plano efetivo; cancelamento volta ao padrão", async () => {
    const plan = async () => (await owner.client.rpc("organization_plan", { org })).data?.[0]?.plan_code;
    expect(await plan()).toBe("free");
    const { data: sub } = await admin.from("subscriptions").insert({ organization_id: org, provider: "development", plan_code: "pro", status: "active" }).select("id").single();
    expect(await plan()).toBe("pro");
    await admin.from("subscriptions").update({ status: "canceled" }).eq("id", sub!.id);
    expect(await plan()).toBe("free");
    const { data: events } = await owner.client.from("subscription_events").select("event_type, new_status").eq("subscription_id", sub!.id).order("created_at");
    expect(events?.map((e) => e.new_status)).toEqual(["active", "canceled"]);
  });

  it("conta o uso com as mesmas regras dos limites", async () => {
    const usage = await getUsage(owner.client, org);
    expect(usage).toMatchObject({ max_members: 1, max_products: 0, max_marketplace_accounts: 0 });
  });

  it("snapshot mensal grava usage_records de forma idempotente", async () => {
    const enqueue = createEnqueue(admin);
    const job = { id: "x", organization_id: null, job_type: "billing.usage_snapshot", attempts: 1, max_attempts: 3, payload: {} };
    await jobHandlers["billing.usage_snapshot"](job, { admin, workerId: "t", enqueue });
    await jobHandlers["billing.usage_snapshot"](job, { admin, workerId: "t", enqueue });
    const { data } = await owner.client.from("usage_records").select("metric, quantity").eq("organization_id", org).eq("metric", "members");
    expect(data).toEqual([{ metric: "members", quantity: 1 }]);
  });

  it("empresa suspensa deixa de ser acessível aos membros", async () => {
    await admin.from("organizations").update({ status: "suspended" }).eq("id", org);
    const { data } = await owner.client.from("organizations").select("id").eq("id", org);
    expect(data).toEqual([]);
    const { error } = await owner.client.from("catalog_products").insert({ organization_id: org, title: "Bloqueado", normalized_title: "bloqueado" });
    expect(error?.code).toBe("42501");
    await admin.from("organizations").update({ status: "active" }).eq("id", org);
    const again = await owner.client.from("organizations").select("id").eq("id", org);
    expect(again.data).toHaveLength(1);
  });

  it("usuário comum não altera planos nem acessa administração", async () => {
    const plans = await owner.client.from("plans").update({ monthly_price_cents: 1 }).eq("code", "free").select("code");
    expect(plans.error?.code ?? (plans.data?.length === 0 ? "sem efeito" : "alterou")).not.toBe("alterou");
    const admins = await owner.client.from("platform_admins").insert({ user_id: owner.id });
    expect(admins.error?.code).toBe("42501");
    const audit = await owner.client.from("admin_audit_logs").select("id");
    expect(audit.error?.code).toBe("42501");
  });
});
