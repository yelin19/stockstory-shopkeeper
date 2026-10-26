import { describe, expect, it } from "vitest";
import {
  cashPaymentChoices,
  parseCashPaymentChoice,
  paymentMethodInstruction,
  paymentMethodLabel,
} from "@/lib/payment-method";

describe("cash payment choices", () => {
  it("offers separate courier COD and seller-delivery cash choices", () => {
    expect(cashPaymentChoices.map((choice) => choice.method)).toEqual([
      "courier_cod",
      "seller_delivery_cash",
    ]);
    expect(parseCashPaymentChoice("PAY_COURIER_COD")).toBe("courier_cod");
    expect(parseCashPaymentChoice("PAY_SELLER_DELIVERY_CASH")).toBe("seller_delivery_cash");
  });

  it("accepts the visible quick-reply titles but rejects unknown choices", () => {
    for (const choice of cashPaymentChoices) {
      expect(parseCashPaymentChoice(choice.quickReplyTitle)).toBe(choice.method);
    }
    expect(parseCashPaymentChoice("PREPAY")).toBeNull();
    expect(parseCashPaymentChoice("NO_BUY")).toBeNull();
  });

  it("uses Burmese labels and distinguishes who collects the money", () => {
    expect(paymentMethodLabel("courier_cod")).toContain("ပို့ဆောင်ရေးကုမ္ပဏီ");
    expect(paymentMethodLabel("cod")).toContain("စနစ်ဟောင်း");
    expect(paymentMethodLabel("seller_delivery_cash")).toContain("ဆိုင်ဘက်မှ");
    expect(paymentMethodLabel("prepaid")).toBe("ကြိုတင်ငွေလွှဲ");
    expect(paymentMethodInstruction("courier_cod")).toContain("ပြန်လွှဲပါမည်");
    expect(paymentMethodInstruction("seller_delivery_cash")).toContain("တိုက်ရိုက်ငွေချေ");
  });
});
