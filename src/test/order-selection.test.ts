import { describe, expect, it } from "vitest";
import {
  toggleAllPublicOrders,
  togglePublicOrderSelection,
  uniquePublicOrderIds,
} from "@/lib/order-selection";

describe("order-level selection", () => {
  const eightRows = [
    { public_order_id: "1001" },
    { public_order_id: "1001" },
    { public_order_id: "1001" },
    { public_order_id: "1002" },
    { public_order_id: "1002" },
    { public_order_id: "1003" },
    { public_order_id: "1003" },
    { public_order_id: "1003" },
  ];

  it("counts multiple product rows as one customer order", () => {
    expect(uniquePublicOrderIds(eightRows)).toEqual(["1001", "1002", "1003"]);
  });

  it("selects and deselects one whole order without leaving hidden product rows selected", () => {
    const orderIds = uniquePublicOrderIds(eightRows);
    const allSelected = toggleAllPublicOrders([], orderIds);
    expect(allSelected).toHaveLength(3);
    expect(toggleAllPublicOrders(allSelected, orderIds)).toEqual([]);

    const oneDeselected = togglePublicOrderSelection(allSelected, "1002");
    expect(oneDeselected).toEqual(["1001", "1003"]);

    const noneSelected = orderIds.reduce(
      (selected, orderId) => togglePublicOrderSelection(selected, orderId),
      allSelected,
    );
    expect(noneSelected).toEqual([]);
  });

  it("keeps selections from other filters but toggles only the requested visible orders", () => {
    expect(toggleAllPublicOrders(["hidden"], ["1001", "1002"])).toEqual(["hidden", "1001", "1002"]);
  });
});
