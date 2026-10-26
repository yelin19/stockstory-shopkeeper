import { describe, expect, it } from "vitest";
import {
  customerPaymentChoices,
  parsePaymentChoice,
  paymentMethodInstruction,
  paymentMethodLabel,
} from "@/lib/payment-method";

describe("customer payment choices", () => {
  it("offers advance transfer and seller-delivery cash as separate choices", () => {
    expect(customerPaymentChoices.map((choice) => choice.method)).toEqual([
      "prepaid",
      "seller_delivery_cash",
    ]);
    expect(parsePaymentChoice("PREPAY")).toBe("prepaid");
    expect(parsePaymentChoice("PAY_SELLER_DELIVERY_CASH")).toBe("seller_delivery_cash");
  });

  it("treats existing COD quick replies as advance payment for compatibility", () => {
    expect(parsePaymentChoice("PAY_COURIER_COD")).toBe("prepaid");
    expect(parsePaymentChoice("🚚 COD")).toBe("prepaid");
  });

  it("accepts visible quick-reply titles and rejects unknown choices", () => {
    for (const choice of customerPaymentChoices) {
      expect(parsePaymentChoice(choice.quickReplyTitle)).toBe(choice.method);
    }
    expect(parsePaymentChoice("NO_BUY")).toBeNull();
  });

  it("keeps Burmese payment labels and historical COD descriptions", () => {
    expect(paymentMethodLabel("prepaid")).toBe("ကြိုတင်ငွေလွှဲ");
    expect(paymentMethodLabel("seller_delivery_cash")).toContain("ဆိုင်ဘက်မှ");
    expect(paymentMethodLabel("cod")).toContain("စနစ်ဟောင်း");
    expect(paymentMethodInstruction("prepaid")).toContain("ဖြတ်ပိုင်း");
    expect(paymentMethodInstruction("seller_delivery_cash")).toContain("တိုက်ရိုက်ငွေချေ");
    expect(paymentMethodInstruction("courier_cod")).toContain("စနစ်ဟောင်း");
  });
});
