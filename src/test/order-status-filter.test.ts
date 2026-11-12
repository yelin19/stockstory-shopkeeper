import { describe, expect, it } from "vitest";
import { matchesOrderStatus } from "@/lib/order-status-filter";

describe("admin order status filter", () => {
  const statuses = ["confirmed", "delivered", "cancelled", "cancelled"];

  it("shows customer-cancelled orders when the cancelled option is chosen", () => {
    expect(statuses.filter((status) => matchesOrderStatus(status, "cancelled"))).toEqual([
      "cancelled",
      "cancelled",
    ]);
  });

  it("keeps every order visible when all orders is selected", () => {
    expect(statuses.filter((status) => matchesOrderStatus(status, "all"))).toEqual(statuses);
  });
});
