import { describe, expect, it } from "vitest";
import { formatReturnedOrderHistory } from "@/lib/messenger-order-history";

describe("formatReturnedOrderHistory", () => {
  it("formats the returned order using its stored product unit", () => {
    expect(formatReturnedOrderHistory({
      public_order_id: "100013",
      product_name: "အိတ်",
      product_unit: "ထုပ်",
      quantity: 2,
      created_at: "2026-10-24T00:00:00.000Z",
    })).toContain("အရေအတွက်: 2ထုပ်");
  });
});
