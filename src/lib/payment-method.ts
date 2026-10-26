export type CashPaymentMethod = "courier_cod" | "seller_delivery_cash";
export type OrderPaymentMethod = CashPaymentMethod | "cod" | "prepaid";

export const cashPaymentChoices: {
  method: CashPaymentMethod;
  payload: string;
  quickReplyTitle: string;
}[] = [
  { method: "courier_cod", payload: "PAY_COURIER_COD", quickReplyTitle: "🚚 COD" },
  {
    method: "seller_delivery_cash",
    payload: "PAY_SELLER_DELIVERY_CASH",
    quickReplyTitle: "🏠 ဆိုင်ပို့ ငွေချေ",
  },
];

const paymentLabels: Record<OrderPaymentMethod, string> = {
  cod: "အရင်အော်ဒါ (စနစ်ဟောင်း) — COD ကောက်ခံသူ မခွဲထားပါ",
  courier_cod: "ပို့ဆောင်ရေးကုမ္ပဏီမှ ငွေကောက်ခံ (COD)",
  seller_delivery_cash: "ဆိုင်ဘက်မှ အိမ်အရောက်ပို့ပြီး ငွေချေ",
  prepaid: "ကြိုတင်ငွေလွှဲ",
};

export function paymentMethodLabel(method: string | null | undefined): string {
  if (
    method === "cod" ||
    method === "courier_cod" ||
    method === "seller_delivery_cash" ||
    method === "prepaid"
  ) {
    return paymentLabels[method];
  }
  return "ငွေပေးချေနည်းလမ်း မသတ်မှတ်ရသေးပါ";
}

export function paymentMethodInstruction(method: string | null | undefined): string {
  if (method === "courier_cod") {
    return "ပို့ဆောင်ရေးကုမ္ပဏီက ပစ္စည်းပို့ချိန် ဝယ်သူထံမှ ငွေကောက်ခံပြီး ဆိုင်သို့ ပြန်လွှဲပါမည်။";
  }
  if (method === "cod")
    return "ဤအော်ဒါသည် စနစ်ဟောင်းမှဖြစ်၍ ငွေကောက်ခံသူကို သီးခြားမှတ်တမ်းမတင်ထားပါ။";
  if (method === "seller_delivery_cash") {
    return "ဆိုင်ဘက်မှ ပို့ဆောင်သူထံ ပစ္စည်းလက်ခံချိန် တိုက်ရိုက်ငွေချေပါ။";
  }
  if (method === "prepaid") {
    return "ငွေလွှဲဖြတ်ပိုင်းကို ပို့ပြီး ဆိုင်ရှင်အတည်ပြုချက်ကို စောင့်ပါ။";
  }
  return "ငွေပေးချေနည်းလမ်းကို ဆိုင်ရှင်ထံ ဆက်သွယ်အတည်ပြုပါ။";
}

export function parseCashPaymentChoice(value: string): CashPaymentMethod | null {
  const choice = value.trim().toLocaleLowerCase();
  if (choice === "pay_courier_cod" || choice === "🚚 cod" || choice === "cod") return "courier_cod";
  if (
    choice === "pay_seller_delivery_cash" ||
    choice === "🏠 ဆိုင်ပို့ ငွေချေ" ||
    choice === "ဆိုင်ပို့ ငွေချေ"
  ) {
    return "seller_delivery_cash";
  }
  return null;
}
