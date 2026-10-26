import { describe, expect, it } from "vitest";
import { matchProductCode } from "@/lib/product-code-match";

const products = [{ code: "iPhone", name: "Phone" }];

describe("matchProductCode", () => {
  it("matches exact codes without regard to Latin letter case", () => {
    expect(matchProductCode("IPHONE", products)).toEqual({
      kind: "matched",
      product: products[0],
      distance: 0,
    });
  });

  it.each(["xPhone", "iPbone", "iPhonf", "iPhne", "iPphone"])(
    "matches a single typo anywhere in a sufficiently long code: %s",
    (input) => {
      expect(matchProductCode(input, products)).toEqual({
        kind: "matched",
        product: products[0],
        distance: 1,
      });
    },
  );

  it("matches a one-character typo in a Burmese product code", () => {
    expect(matchProductCode("ဖိနတ်", [{ code: "ဖိနပ်" }])).toEqual({
      kind: "matched",
      product: { code: "ဖိနပ်" },
      distance: 1,
    });
  });

  it("asks for clarification when multiple codes are equally close", () => {
    const result = matchProductCode("iPhone", [{ code: "iPhona" }, { code: "iPhonf" }]);
    expect(result).toEqual({
      kind: "ambiguous",
      candidates: [{ code: "iPhona" }, { code: "iPhonf" }],
    });
  });

  it("does not fuzzy-match short codes or codes with more than one typo", () => {
    expect(matchProductCode("A1", [{ code: "A2" }])).toEqual({ kind: "none" });
    expect(matchProductCode("iPxxne", products)).toEqual({ kind: "none" });
  });
});
