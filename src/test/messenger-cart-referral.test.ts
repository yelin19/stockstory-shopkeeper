import { describe, expect, it } from "vitest";
import {
  createMessengerCartReferral,
  decodeMessengerCartReferral,
} from "@/lib/messenger-cart-referral";

describe("Messenger cart referral payload", () => {
  it("round-trips multiple products and Thai address fields through URL-safe referral data", () => {
    const items = [
      { code: "111", qty: 2 },
      { code: "A-22", qty: 1 },
    ];
    const addressLines = [
      "ADDR_PROVINCE: 74|สค|สมุทรสาคร",
      "ADDR_DISTRICT: 7401|เมืองสมุทรสาคร",
      "ADDR_SUBDISTRICT: 740101|มหาชัย|74000",
      "ADDR_DETAIL: 123/4 หมู่ 5 ถนนสุขุมวิท",
    ];

    const referral = createMessengerCartReferral(items, addressLines);

    expect(referral).toMatch(/^webcart1_[A-Za-z0-9_-]+$/);
    expect(decodeMessengerCartReferral(referral)).toEqual({ items, addressLines });
  });

  it("rejects malformed, oversized, and invalid cart data", () => {
    expect(decodeMessengerCartReferral("webcart1_not-valid-base64-json")).toBeNull();
    expect(decodeMessengerCartReferral(`webcart1_${"a".repeat(2100)}`)).toBeNull();
    expect(createMessengerCartReferral([], [])).toBeNull();
    expect(createMessengerCartReferral([{ code: "111", qty: 0 }], [])).toBeNull();
    expect(
      createMessengerCartReferral(
        [{ code: "111", qty: 1 }],
        ["x".repeat(600), "y".repeat(600), "z".repeat(600)],
      ),
    ).toBeNull();
  });
});
