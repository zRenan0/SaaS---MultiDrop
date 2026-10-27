import { describe, expect, it } from "vitest";
import { fulfillmentFromPurchaseOrder, PO_TRANSITIONS } from "@/features/orders/status";
import { retryDelaySeconds } from "@/server/jobs/types";

describe("pedidos e fila", () => {
  it("transições do pedido de compra espelham o trigger do banco", () => {
    expect(PO_TRANSITIONS.draft).toEqual(["submitted", "canceled"]);
    expect(PO_TRANSITIONS.submitted).toEqual(["accepted", "rejected", "canceled"]);
    expect(PO_TRANSITIONS.accepted).toEqual(["shipped", "canceled"]);
    expect(PO_TRANSITIONS.shipped).toEqual(["delivered"]);
    expect(PO_TRANSITIONS.delivered).toEqual([]);
  });

  it("status do pedido de compra define o andamento da venda", () => {
    expect(fulfillmentFromPurchaseOrder("submitted")).toBe("forwarded");
    expect(fulfillmentFromPurchaseOrder("shipped")).toBe("shipped");
    expect(fulfillmentFromPurchaseOrder("rejected")).toBe("problem");
    expect(fulfillmentFromPurchaseOrder("canceled")).toBe("awaiting_supplier");
    expect(fulfillmentFromPurchaseOrder("draft")).toBeNull();
  });

  it("backoff da fila cresce até 1 hora", () => {
    expect([1, 2, 3, 4].map(retryDelaySeconds)).toEqual([30, 60, 120, 240]);
    expect(retryDelaySeconds(20)).toBe(3600);
  });
});
