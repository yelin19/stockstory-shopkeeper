import { describe, expect, it } from "vitest";
import { formatCurrency, normalizeCurrency, sumByCurrency } from "@/lib/currency";

describe("formatCurrency", () => {
  it("formats MMK and THB with the selected unit", () => {
    expect(formatCurrency(1200, "MMK")).toBe("1,200 Ks");
    expect(formatCurrency(1200, "THB")).toBe("1,200 ฿");
  });

  it("defaults unknown and missing currencies to MMK", () => {
    expect(normalizeCurrency(undefined)).toBe("MMK");
    expect(formatCurrency(50, "unknown")).toBe("50 Ks");
  });
});

describe("sumByCurrency", () => {
  it("keeps totals in different currencies separate", () => {
    expect(sumByCurrency([
      { total: 1000, currency: "MMK" },
      { total: 2000, currency: "MMK" },
      { total: 40, currency: "THB" },
    ])).toBe("3,000 Ks · 40 ฿");
  });

  it("uses the selected currency for legacy rows without a currency snapshot", () => {
    expect(sumByCurrency([{ total: 250 }], "THB")).toBe("250 ฿");
  });
});
