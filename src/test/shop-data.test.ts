import { describe, expect, it } from "vitest";
import { isOrderShipped, productImageUrl, productPageUrl } from "@/lib/shop-data";

describe("isOrderShipped", () => {
  it("does not classify tracking details alone as a completed shipment", () => {
    expect(isOrderShipped({ sent: false, delivery_status: "confirmed" })).toBe(false);
  });

  it("classifies orders as shipped only after notification, except returned orders", () => {
    expect(isOrderShipped({ sent: true, delivery_status: "confirmed" })).toBe(true);
    expect(isOrderShipped({ sent: false, delivery_status: "in_transit" })).toBe(false);
    expect(isOrderShipped({ sent: false, delivery_status: "delivered" })).toBe(false);
    expect(isOrderShipped({ sent: false, delivery_status: "returned" })).toBe(true);
  });
});

describe("productImageUrl", () => {
  it("uses the full storage path as the cache version", () => {
    expect(productImageUrl("111", "owner/first-random-id/photo.jpg")).toBe(
      "/api/public/product-image/111?v=owner%2Ffirst-random-id%2Fphoto.jpg",
    );
  });
});

describe("productPageUrl", () => {
  it("creates a shareable URL for the product code", () => {
    expect(productPageUrl("2233", "https://stockstory-shopkeeper.lovable.app")).toBe(
      "https://stockstory-shopkeeper.lovable.app/shop/2233",
    );
  });
});
