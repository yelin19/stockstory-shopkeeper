import { describe, expect, it } from "vitest";
import { isValidProductCode, normalizeProductCode } from "@/lib/product-code";

describe("product code validation", () => {
  it("accepts Burmese letters and Myanmar digits", () => {
    expect(isValidProductCode("ဖိနပ်-၁")).toBe(true);
    expect(isValidProductCode("အင်္ကျီ_၂")).toBe(true);
  });

  it("normalizes whitespace and canonically equivalent text", () => {
    expect(normalizeProductCode(" ဖိနပ်-၁ ")).toBe("ဖိနပ်-၁");
    expect(normalizeProductCode("cafe\u0301")).toBe("café");
  });

  it("rejects spaces, unsupported punctuation and overlong codes", () => {
    expect(isValidProductCode("ဖိနပ် ၁")).toBe(false);
    expect(isValidProductCode("ဖိနပ်/၁")).toBe(false);
    expect(isValidProductCode("A".repeat(33))).toBe(false);
  });
});
