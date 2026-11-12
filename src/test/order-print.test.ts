import { describe, expect, it } from "vitest";
import type { Order } from "@/lib/shop-data";
import { LABEL_HEIGHT_MM, LABEL_PAGE_RULE, LABEL_WIDTH_MM } from "@/lib/label-print";
import { formatRecipientAddress, selectedOrdersForPrint } from "@/lib/order-print";

function order(overrides: Partial<Order> = {}): Order {
  return {
    id: "row-1",
    owner_id: "owner-1",
    psid: "psid-1",
    public_order_id: "100123",
    product_id: "product-1",
    product_code: "P1",
    product_name: "မှုံ့",
    category: "General",
    unit_price: 1200,
    quantity: 1,
    product_unit: "ထုပ်",
    total: 1200,
    customer_name: "ရဲလင်း",
    phone: "0875123515",
    township: "สมุทรสาคร (สค)",
    address: "116/46หมู่ที 7, ตำบลท่าจีน, อำเภอเมืองสมุทรสาคร, จังหวัดสมุทรสาคร, 74000",
    note: null,
    created_at: "2026-11-12T00:00:00.000Z",
    updated_at: "2026-11-12T00:00:00.000Z",
    status: "confirmed",
    sent: false,
    delivery_status: "confirmed",
    currency: "THB",
    payment_method: "prepaid",
    payment_status: "pending",
    payment_proof_url: null,
    tracking_number: null,
    tracking_url: null,
    province_code: null,
    province_name: null,
    district_name: null,
    subdistrict_name: null,
    postal_code: null,
    ...overrides,
  } as Order;
}

describe("printable orders", () => {
  it("keeps the browser print page rule in sync with the label dimensions", () => {
    expect(LABEL_WIDTH_MM).toBe(100);
    expect(LABEL_HEIGHT_MM).toBe(150);
    expect(LABEL_PAGE_RULE).toBe("@page { size: 100mm 150mm; margin: 0; }");
  });

  it("formats an old district-first address into detail, subdistrict, district, province, postal code", () => {
    expect(
      formatRecipientAddress("เมืองสมุทรสาคร", "116/46หมู่ที 7, ท่าจีน, สมุทรสาคร, 74000"),
    ).toBe("116/46หมู่ที 7, ตำบลท่าจีน, อำเภอเมืองสมุทรสาคร, จังหวัดสมุทรสาคร, 74000");
  });

  it("does not duplicate the province when township and address both contain it", () => {
    expect(
      formatRecipientAddress(
        "สมุทรสาคร (สค)",
        "116/46หมู่ที 7, ตำบลท่าจีน, อำเภอเมืองสมุทรสาคร, จังหวัดสมุทรสาคร, 74000",
      ),
    ).toBe("116/46หมู่ที 7, ตำบลท่าจีน, อำเภอเมืองสมุทรสาคร, จังหวัดสมุทรสาคร, 74000");
  });

  it("prints one selected customer order once and totals all of its product rows", () => {
    const cartNote = `CART_ITEMS:${JSON.stringify([
      { product: "မှုန့်", qty: 1, unit: "ထုပ်", price: 1200 },
      { product: "ဖိနပ်", qty: 1, unit: "ရံ", price: 1000 },
    ])}`;
    const first = order({ id: "row-1", note: cartNote, total: 1200 });
    const second = order({
      id: "row-2",
      product_id: "product-2",
      product_code: "P2",
      product_name: "ဖိနပ်",
      unit_price: 1000,
      total: 1000,
    });

    const result = selectedOrdersForPrint([first, second], [second], [second.public_order_id]);

    expect(result).toHaveLength(1);
    expect(result[0]?.public_order_id).toBe("100123");
    expect(result[0]?.print_total).toBe(2200);
    expect(result[0]?.print_products).toHaveLength(2);
  });
});
