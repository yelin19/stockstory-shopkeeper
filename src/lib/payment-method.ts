export type CashPaymentMethod = "courier_cod" | "seller_delivery_cash";
export type CustomerPaymentChoice = "prepaid" | "seller_delivery_cash";
export type OrderPaymentMethod = CashPaymentMethod | "cod" | "prepaid";

export const customerPaymentChoices: {
  method: CustomerPaymentChoice;
  payload: string;
  quickReplyTitle: string;
}[] = [
  { method: "prepaid", payload: "PREPAY", quickReplyTitle: "ငွေကြိုလွှဲမယ်" },
  {
    method: "seller_delivery_cash",
    payload: "PAY_SELLER_DELIVERY_CASH",
    quickReplyTitle: "🏠 အိမ်ရောက်ငွေချေ",
  },
];

export type ProductPaymentOptions = {
  allow_prepaid?: boolean | null;
  allow_seller_delivery_cash?: boolean | null;
};

export function getProductPaymentChoices(product: ProductPaymentOptions) {
  return customerPaymentChoices.filter((choice) =>
    choice.method === "prepaid"
      ? product.allow_prepaid !== false
      : product.allow_seller_delivery_cash === true,
  );
}

export type ProductPaymentFlow = CustomerPaymentChoice | "choose" | "unavailable";

export function getProductPaymentFlow(
  product: ProductPaymentOptions,
  options: { forcePrepaid?: boolean } = {},
): ProductPaymentFlow {
  if (options.forcePrepaid) return "prepaid";
  const choices = getProductPaymentChoices(product);
  if (choices.length > 1) return "choose";
  return choices[0]?.method ?? "unavailable";
}

const paymentLabels: Record<OrderPaymentMethod, string> = {
  cod: "အရင်အော်ဒါ (စနစ်ဟောင်း) — COD ကောက်ခံသူ မခွဲထားပါ",
  courier_cod: "အရင်အော်ဒါ — ပို့ဆောင်ရေးကုမ္ပဏီမှ ငွေကောက်ခံ (COD)",
  seller_delivery_cash: "အိမ်ရောက်ငွေချေ (ဆိုင်မှပို့ဆောင်)",
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
    return "ဤအော်ဒါသည် စနစ်ဟောင်းမှဖြစ်၍ ပို့ဆောင်ရေးကုမ္ပဏီက ငွေကောက်ခံရန် သတ်မှတ်ထားပါသည်။";
  }
  if (method === "cod")
    return "ဤအော်ဒါသည် စနစ်ဟောင်းမှဖြစ်၍ ငွေကောက်ခံသူကို သီးခြားမှတ်တမ်းမတင်ထားပါ။";
  if (method === "seller_delivery_cash") {
    return "ဆိုင်ဘက်မှ ပို့ဆောင်ပေးသည့် အော်ဒါဖြစ်ပါသည်။ ပစ္စည်းအိမ်ရောက်ချိန်တွင် ငွေချေပါ။";
  }
  if (method === "prepaid") {
    return "ငွေလွှဲဖြတ်ပိုင်းကို ပို့ပြီး ဆိုင်ရှင်အတည်ပြုချက်ကို စောင့်ပါ။";
  }
  return "ငွေပေးချေနည်းလမ်းကို ဆိုင်ရှင်ထံ ဆက်သွယ်အတည်ပြုပါ။";
}

export function parsePaymentChoice(value: string): CustomerPaymentChoice | null {
  const choice = value.trim().toLocaleLowerCase();
  if (
    choice === "prepay" ||
    choice === "ငွေကြိုလွှဲမယ်" ||
    choice === "ငွေကြိုလွှဲပါမည်" ||
    choice === "pay_courier_cod" ||
    choice === "🚚 cod" ||
    choice === "cod"
  ) {
    return "prepaid";
  }
  if (
    choice === "pay_seller_delivery_cash" ||
    choice === "🏠 အိမ်ရောက်ငွေချေ" ||
    choice === "အိမ်ရောက်ငွေချေ" ||
    choice === "🏠 ဆိုင်ပို့ ငွေချေ" ||
    choice === "ဆိုင်ပို့ ငွေချေ"
  ) {
    return "seller_delivery_cash";
  }
  return null;
}
