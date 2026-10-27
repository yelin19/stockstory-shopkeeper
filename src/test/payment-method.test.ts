import { describe, expect, it } from "vitest";
import {
  customerPaymentChoices,
  getProductPaymentChoices,
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
    expect(customerPaymentChoices.map((choice) => choice.quickReplyTitle)).toEqual([
      "ငွေကြိုလွှဲမယ်",
      "🏠 အိမ်ရောက်ငွေချေ",
    ]);
    expect(parsePaymentChoice("PREPAY")).toBe("prepaid");
    expect(parsePaymentChoice("PAY_SELLER_DELIVERY_CASH")).toBe("seller_delivery_cash");
    expect(parsePaymentChoice("ငွေကြိုလွှဲမယ်")).toBe("prepaid");
    expect(parsePaymentChoice("🏠 အိမ်ရောက်ငွေချေ")).toBe("seller_delivery_cash");
    expect(parsePaymentChoice("ငွေကြိုလွှဲပါမည်")).toBe("prepaid");
    expect(parsePaymentChoice("🏠 ဆိုင်ပို့ ငွေချေ")).toBe("seller_delivery_cash");
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

  it("shows only payment methods enabled for the product", () => {
    expect(
      getProductPaymentChoices({ allow_prepaid: true, allow_seller_delivery_cash: true }).map(
        (choice) => choice.method,
      ),
    ).toEqual(["prepaid", "seller_delivery_cash"]);
    expect(
      getProductPaymentChoices({ allow_prepaid: true, allow_seller_delivery_cash: false }).map(
        (choice) => choice.method,
      ),
    ).toEqual(["prepaid"]);
    expect(
      getProductPaymentChoices({ allow_prepaid: false, allow_seller_delivery_cash: true }).map(
        (choice) => choice.method,
      ),
    ).toEqual(["seller_delivery_cash"]);
    expect(getProductPaymentChoices({}).map((choice) => choice.method)).toEqual(["prepaid"]);
  });

  it("keeps Burmese payment labels and historical COD descriptions", () => {
    expect(paymentMethodLabel("prepaid")).toBe("ကြိုတင်ငွေလွှဲ");
    expect(paymentMethodLabel("seller_delivery_cash")).toBe("အိမ်ရောက်ငွေချေ (ဆိုင်မှပို့ဆောင်)");
    expect(paymentMethodLabel("cod")).toContain("စနစ်ဟောင်း");
    expect(paymentMethodInstruction("prepaid")).toContain("ဖြတ်ပိုင်း");
    expect(paymentMethodInstruction("seller_delivery_cash")).toContain("အိမ်ရောက်ချိန်တွင် ငွေချေ");
    expect(paymentMethodInstruction("courier_cod")).toContain("စနစ်ဟောင်း");
  });
});
