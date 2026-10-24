import { describe, expect, it } from "vitest";
import { formatLowStockAlertMessage, lowStockPairingConfirmation, parseLowStockPairPin } from "@/lib/low-stock-alert";

describe("parseLowStockPairPin", () => {
  it("accepts the documented PIN command", () => {
    expect(parseLowStockPairPin("PIN 123456")).toBe("123456");
    expect(parseLowStockPairPin(" pin 00123456 ")).toBe("00123456");
    expect(parseLowStockPairPin("123456", true)).toBe("123456");
    expect(parseLowStockPairPin("00123456", true)).toBe("00123456");
  });

  it("does not treat product codes or invalid PIN lengths as pairing commands", () => {
    expect(parseLowStockPairPin("123456")).toBeNull();
    expect(parseLowStockPairPin("123456", false)).toBeNull();
    expect(parseLowStockPairPin("PIN 12345")).toBeNull();
    expect(parseLowStockPairPin("PIN 123456789")).toBeNull();
  });
});

describe("formatLowStockAlertMessage", () => {
  it("includes product, current stock, and threshold", () => {
    expect(formatLowStockAlertMessage({ product_code: "2233", product_name: "Shampoo", stock: 3, threshold: 5 }))
      .toBe("⚠️ လက်ကျန်နည်းနေပါပြီ\nပစ္စည်း: Shampoo (2233)\nလက်ကျန်: 3 ခု\nသတိပေးအရေအတွက်: 5 ခု");
  });
});

describe("lowStockPairingConfirmation", () => {
  it("confirms the linked account and explains how to change it", () => {
    const message = lowStockPairingConfirmation();
    expect(message).toContain("ချိတ်ဆက်ပြီးပါပြီ");
    expect(message).toContain("အကောင့်ပြောင်းရန်");
  });
});
