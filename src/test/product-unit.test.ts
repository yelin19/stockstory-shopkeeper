import { describe, expect, it } from "vitest";
import { formatQuantity, isValidProductUnit, normalizeProductUnit } from "@/lib/product-unit";

describe("product quantity units", () => {
  it("formats a quantity with the configured unit", () => {
    expect(formatQuantity(1, "ထုပ်")).toBe("1ထုပ်");
    expect(formatQuantity(5, "ပုံး")).toBe("5ပုံး");
  });

  it("supports labels written in different languages and defaults empty values", () => {
    expect(isValidProductUnit("အိတ်")).toBe(true);
    expect(isValidProductUnit("包")).toBe(true);
    expect(normalizeProductUnit("  ")).toBe("ခု");
  });

  it("rejects empty, multiline, and overlong labels", () => {
    expect(isValidProductUnit("   ")).toBe(false);
    expect(isValidProductUnit("one\ntwo")).toBe(false);
    expect(isValidProductUnit("a".repeat(33))).toBe(false);
  });
});
