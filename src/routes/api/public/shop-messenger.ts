import { createFileRoute } from "@tanstack/react-router";
import { parseProductRequest, isYes, isNo } from "@/lib/messenger-parse";
import { messengerPayloadSchema, messengerVerificationSchema, verifyMessengerSignature } from "@/lib/messenger-webhook";
import { formatCurrency } from "@/lib/currency";
import { dispatchLowStockAlerts } from "@/lib/low-stock-alert.server";
import { lowStockPairingConfirmation, parseLowStockPairPin } from "@/lib/low-stock-alert";
import { productPageUrl } from "@/lib/shop-data";
import { formatQuantity, normalizeProductUnit } from "@/lib/product-unit";
import { formatReturnedOrderHistory } from "@/lib/messenger-order-history";
import { formatPaymentProofReviewMessage, sendPaymentProofNotification } from "@/lib/payment-proof-notification.server";
import { customerPaymentChoices, getProductPaymentChoices, getProductPaymentFlow, parsePaymentChoice, paymentMethodInstruction, paymentMethodLabel, type CashPaymentMethod, type OrderPaymentMethod } from "@/lib/payment-method";
import { parseCustomerDetailsChoice } from "@/lib/customer-details-choice";
import { matchProductCode } from "@/lib/product-code-match";
import { extractCustomerDetailsFromImageUrl } from "@/lib/customer-details-image.server";

// Shop Messenger webhook. Secrets (server-only): SHOP_FB_APP_SECRET, SHOP_FB_VERIFY_TOKEN, SHOP_FB_PAGE_ACCESS_TOKEN.
// The FB_* aliases are also accepted so existing Lovable secrets continue to work.

const envFirst = (...names: string[]) => names.map((name) => process.env[name]).find(Boolean);

type Admin = Awaited<typeof import("@/integrations/supabase/client.server")>["supabaseAdmin"];
type Session = { owner_id: string; psid: string; pin_verified: boolean; state: string; data: Record<string, unknown> };
type CustomerDetails = { name: string; phone: string; address: string };
function readCustomerDetails(value: unknown): CustomerDetails | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const data = value as Record<string, unknown>;
  if (typeof data["name"] !== "string" || typeof data["phone"] !== "string" || typeof data["address"] !== "string") return null;
  const name = data["name"].trim();
  const phone = data["phone"].trim();
  const address = data["address"].trim();
  return name && phone && address ? { name, phone, address } : null;
}
function previousCustomerFromDraft(draft: Record<string, unknown>): CustomerDetails | null {
  return readCustomerDetails(draft["previous_customer"]) ?? readCustomerDetails(draft);
}
const callShopRpc = (db: Admin, name: string, args: Record<string, unknown>) =>
  (db.rpc as unknown as (fn: string, params: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>)(name, args);
const retryLowStockAlerts = async (owner: string, productId: string | null = null) => {
  try {
    const result = await dispatchLowStockAlerts(owner, productId);
    if (result.failed) console.error("Could not deliver low-stock Messenger alert", result.errors);
  } catch (error) {
    console.error("Could not process low-stock Messenger alert", (error as Error).message);
  }
};

async function send(psid: string, message: Record<string, unknown>) {
  const token = envFirst("SHOP_FB_PAGE_ACCESS_TOKEN", "FB_PAGE_ACCESS_TOKEN");
  if (!token) return;
  const res = await fetch(`https://graph.facebook.com/v21.0/me/messages?access_token=${encodeURIComponent(token)}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ recipient: { id: psid }, messaging_type: "RESPONSE", message }),
  });
  if (!res.ok) console.error("Messenger send failed", res.status);
}
const text = (psid: string, t: string) => send(psid, { text: t });
async function sendCommentPrivateReply(commentId: string, message: string) {
  const token = envFirst("SHOP_FB_PAGE_ACCESS_TOKEN", "FB_PAGE_ACCESS_TOKEN");
  if (!token) return false;
  const res = await fetch(`https://graph.facebook.com/v21.0/${encodeURIComponent(commentId)}/private_replies?access_token=${encodeURIComponent(token)}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ message }),
  });
  if (!res.ok) console.error("Facebook comment private reply failed", res.status);
  return res.ok;
}
const customerDetailsPhotoDisclosure = "အချက်အလက်အသစ်ကို စာသားဖြင့်ပို့နိုင်သလို အမည်၊ ဖုန်းနံပါတ်နှင့် လိပ်စာပါသော ပုံကိုလည်း ပို့နိုင်ပါသည်။";
const customerDetailsExample = "အမည်: မောင်မောင်\nဖုန်း: 09xxxxxxxxx\nလိပ်စာ: အိမ်အမှတ်၊ လမ်း၊ မြို့နယ်";
const customerDetailsRequest = (intro: string) => `${intro}\n${customerDetailsExample}\n\n${customerDetailsPhotoDisclosure}`;
async function sendUpdate(psid: string, messageText: string) {
  const token = envFirst("SHOP_FB_PAGE_ACCESS_TOKEN", "FB_PAGE_ACCESS_TOKEN");
  if (!token) return false;
  try {
    const response = await fetch(`https://graph.facebook.com/v21.0/me/messages?access_token=${encodeURIComponent(token)}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ recipient: { id: psid }, messaging_type: "UPDATE", message: { text: messageText } }),
    });
    if (!response.ok) console.error("Messenger order review update failed", response.status);
    return response.ok;
  } catch (error) {
    console.error("Messenger order review update failed", (error as Error).message);
    return false;
  }
}
async function sendProductCard(
  psid: string,
  product: { code: string; name: string; price: number; stock: number; unit: string; image_url: string | null },
  origin: string,
  formatPrice: (amount: number) => string,
) {
  const url = productPageUrl(product.code, origin);
  const element: Record<string, unknown> = {
    title: product.name.slice(0, 80),
    subtitle: `တစ်${normalizeProductUnit(product.unit)}ဈေး ${formatPrice(Number(product.price))} · လက်ကျန် ${formatQuantity(product.stock, product.unit)}`,
    default_action: { type: "web_url", url, webview_height_ratio: "tall" },
    buttons: [{ type: "web_url", url, title: "ပစ္စည်းကို ကြည့်ရန်" }],
  };
  if (product.image_url) {
    element["image_url"] = `${origin}/api/public/product-image/${encodeURIComponent(product.code)}`;
  }
  await send(psid, { attachment: { type: "template", payload: { template_type: "generic", elements: [element] } } });
}
const confirmation = (psid: string, t: string) => send(psid, {
  text: t,
  quick_replies: [
    { content_type: "text", title: "YES", payload: "YES" },
    { content_type: "text", title: "NO", payload: "NO" },
  ],
});
const paymentChoices = (psid: string, t: string) => send(psid, {
  text: t,
  quick_replies: [
    { content_type: "text", title: "ငွေကြိုလွှဲမယ်", payload: "PREPAY" },
    { content_type: "text", title: "မဝယ်တော့ပါ", payload: "NO_BUY" },
  ],
});
const paymentChoiceInstructions = (choices: typeof customerPaymentChoices) => choices.map((choice) =>
  choice.method === "prepaid"
    ? "💳 ငွေကြိုလွှဲမယ် — ဘဏ်အချက်အလက်အတိုင်း ငွေလွှဲပြီး ဖြတ်ပိုင်းပို့ပါ။ Admin စစ်ဆေးအတည်ပြုပါမည်။"
    : "🏠 အိမ်ရောက်ငွေချေ — ပစ္စည်းအိမ်ရောက်ချိန်တွင် ဆိုင်ဘက်ပို့သူထံ ငွေချေပါ။",
).join("\n");
const deliveryPaymentChoices = (psid: string, t: string, choices = customerPaymentChoices) => send(psid, {
  text: t,
  quick_replies: [
    ...choices.map((choice) => ({
      content_type: "text",
      title: choice.quickReplyTitle,
      payload: choice.payload,
    })),
    { content_type: "text", title: "မဝယ်တော့ပါ", payload: "NO_BUY" },
  ],
});
const reuseCustomerDetailsChoice = (psid: string, customer: CustomerDetails) => send(psid, {
  text: `အရင်အော်ဒါက အမည်၊ ဖုန်းနံပါတ်နဲ့ လိပ်စာကို ဒီအော်ဒါအတွက် ပြန်သုံးမလား။\nအမည်: ${customer.name}\nဖုန်း: ${customer.phone}\nလိပ်စာ: ${customer.address}\n\n${customerDetailsPhotoDisclosure}`,
  quick_replies: [
    { content_type: "text", title: "အဟောင်းသုံးမည်", payload: "REUSE_CUSTOMER_DETAILS" },
    { content_type: "text", title: "အသစ်ထည့်မည်", payload: "ENTER_CUSTOMER_DETAILS" },
  ],
});
const orderActions = (psid: string, t: string, orderId: string) => send(psid, {
  text: t,
  quick_replies: [
    { content_type: "text", title: "ပြင်မည်", payload: `ပြင် ${orderId}` },
    { content_type: "text", title: "ဖျက်မည်", payload: `ဖျက် ${orderId}` },
  ],
});
const orderCommand = (msg: string, words: string[]) => msg.trim().match(new RegExp(`^(?:${words.join("|")})\\s+([0-9]{6})$`, "i"))?.[1];
const orderIsLocked = (o: { sent?: boolean; delivery_status?: string }) => Boolean(o.sent || ["shipped", "in_transit", "delivered", "returned"].includes(o.delivery_status ?? ""));

function parseCustomerDetails(msg: string): CustomerDetails | null {
  const lines = msg.split(/\r?\n/).map((v) => v.trim()).filter(Boolean);
  const get = (re: RegExp) => msg.match(re)?.[1]?.trim();
  const name = get(/(?:အမည်|နာမည်)\s*[:：-]\s*(.+)/i) ?? lines[0];
  const phone = get(/(?:ဖုန်း(?:နံပါတ်)?|phone)\s*[:：-]\s*([0-9+\-\s]{6,20})/i) ?? lines[1];
  const address = get(/(?:လိပ်စာ|ပို့ရမည့်လိပ်စာ|address)\s*[:：-]\s*(.+)/i) ?? lines.slice(2).join(" ");
  if (!name || !phone || !address || !/^[0-9+\-\s]{6,20}$/.test(phone)) return null;
  return { name: name.slice(0, 100), phone: phone.slice(0, 20), address: address.slice(0, 500) };
}

async function handlePaymentReviewAction(
  db: Admin,
  owner: string,
  adminPsid: string,
  action: "APPROVE" | "CANCEL" | "CANCEL_CONFIRM" | "CANCEL_KEEP",
  orderId: string,
  currency?: string | null,
) {
  const { data: order, error: orderError } = await db.from("orders")
    .select("id, psid, public_order_id, order_no, product_name, total, status, payment_status, product_id, delivery_status, sent")
    .eq("owner_id", owner).eq("public_order_id", orderId).maybeSingle();
  if (orderError) return text(adminPsid, "Order အချက်အလက်ကို ဖတ်မရပါ။ အက်ပ်ထဲတွင် စစ်ဆေးပါ။");
  if (!order) return text(adminPsid, `Order ID: ${orderId} ကို မတွေ့ပါ။`);
  if (action === "CANCEL_KEEP") return text(adminPsid, `Order ID: ${orderId} ကို မပယ်ဖျက်တော့ပါ။`);
  if (order.status === "cancelled") return text(adminPsid, `Order ID: ${orderId} ကို ပယ်ဖျက်ပြီးဖြစ်ပါသည်။`);
  if (order.payment_status !== "proof_submitted") return text(adminPsid, `Order ID: ${orderId} ၏ ငွေလွှဲဖြတ်ပိုင်းကို စစ်ဆေးပြီးဖြစ်ပါသည်။`);
  if (orderIsLocked(order)) return text(adminPsid, `Order ID: ${orderId} ကို ပို့ဆောင်ရေးအခြေအနေကြောင့် ယခု မပြင်ဆင်နိုင်ပါ။`);

  if (action === "CANCEL") {
    await send(adminPsid, {
      attachment: {
        type: "template",
        payload: {
          template_type: "button",
          text: `Order ID: ${orderId} ကို ပယ်ဖျက်မှာ သေချာပါသလား။ အတည်ပြုလျှင် လက်ကျန်ကို ပြန်ဖြည့်ပါမည်။`,
          buttons: [
            { type: "postback", title: "ပယ်ဖျက်ရန် အတည်ပြု", payload: `PAYMENT_REVIEW_CANCEL_CONFIRM:${orderId}` },
            { type: "postback", title: "မလုပ်တော့ပါ", payload: `PAYMENT_REVIEW_CANCEL_KEEP:${orderId}` },
          ],
        },
      },
    });
    return;
  }

  if (action === "APPROVE") {
    const now = new Date().toISOString();
    const { data: approved, error: approvalError } = await db.from("orders")
      .update({ payment_status: "approved", payment_approved_at: now, updated_at: now })
      .eq("id", order.id).eq("owner_id", owner).eq("payment_status", "proof_submitted")
      .select("id").maybeSingle();
    if (approvalError) return text(adminPsid, "ငွေပေးချေမှုကို အတည်ပြုမရပါ။ အက်ပ်ထဲတွင် ထပ်စစ်ပါ။");
    if (!approved) return text(adminPsid, `Order ID: ${orderId} ၏ ငွေလွှဲဖြတ်ပိုင်းကို စစ်ဆေးပြီးဖြစ်ပါသည်။`);
    const buyerMessage = `✅ Order ID: ${orderId} ကို Admin မှ ငွေပေးချေမှုအတည်ပြုပြီးပါပြီရှင်။\nပစ္စည်းအမည်: ${order.product_name}\nပေးချေပြီးငွေ: ${formatCurrency(Number(order.total), currency)}\nမကြာမီ ပို့ဆောင်ပေးပါမယ်ရှင်။`;
    if (order.psid && !(await sendUpdate(order.psid, buyerMessage))) console.error("Could not notify customer that prepaid order was approved");
    await text(adminPsid, `✅ Order ID: ${orderId} ကို အတည်ပြုပြီး ဝယ်သူထံ အကြောင်းကြားပါပြီ။`);
    return;
  }

  if (!order.psid) return text(adminPsid, `Order ID: ${orderId} တွင် ဝယ်သူ Messenger မရှိပါ၊ ပယ်ဖျက်မရပါ။`);
  const { data: cancelled, error: cancelError } = await callShopRpc(db, "cancel_order_by_customer", {
    _owner: owner, _psid: order.psid, _public_order_id: orderId,
  });
  if (cancelError || !cancelled) return text(adminPsid, "Order ကို ပယ်ဖျက်မရပါ။ ပို့ဆောင်ရေးအခြေအနေကို အက်ပ်ထဲတွင် စစ်ဆေးပါ။");
  const now = new Date().toISOString();
  const { error: paymentError } = await db.from("orders").update({ payment_status: "rejected", updated_at: now })
    .eq("id", order.id).eq("owner_id", owner).eq("payment_status", "proof_submitted");
  if (paymentError) console.error("Could not mark cancelled payment proof as rejected", paymentError.message);
  if (order.product_id) await retryLowStockAlerts(owner, order.product_id);
  const buyerMessage = `Order ID: ${orderId} ကို ဆိုင်ဘက်မှ ပယ်ဖျက်လိုက်ပါပြီရှင်။ ငွေလွှဲပြီးသားဖြစ်ပါက ဆိုင်ရှင်ထံ ဆက်သွယ်ပါရှင်။`;
  if (!(await sendUpdate(order.psid, buyerMessage))) console.error("Could not notify customer that prepaid order was cancelled");
  await text(adminPsid, `❌ Order ID: ${orderId} ကို ပယ်ဖျက်ပြီးပါပြီ။`);
}

async function handleText(db: Admin, owner: string, psid: string, msg: string, origin: string, pageUsername?: string | null, detailsFromImage = false) {
  const { data: existing } = await db.from("messenger_sessions").select("*").eq("owner_id", owner).eq("psid", psid).maybeSingle();
  const s: Session = (existing as Session | null) ?? { owner_id: owner, psid, pin_verified: false, state: "idle", data: {} };
  const { data: shopCurrency } = await db.from("shop_settings").select("currency,low_stock_alert_pin_hash,low_stock_alert_psid").eq("owner_id", owner).maybeSingle();
  const fmt = (amount: number) => formatCurrency(amount, shopCurrency?.currency);
  const pairingPin = parseLowStockPairPin(msg, Boolean(shopCurrency?.low_stock_alert_pin_hash && !shopCurrency.low_stock_alert_psid));
  if (pairingPin) {
    const { data: paired, error } = await callShopRpc(db, "pair_low_stock_alert_recipient", {
      _owner: owner, _psid: psid, _pin: pairingPin,
    });
    if (error) return text(psid, "Messenger PIN ချိတ်ဆက်၍မရပါ။ ဒေတာဘေ့စ်ပြင်ဆင်မှု 0016 ကို အရင်လုပ်ဆောင်ပါ။");
    if (paired !== true) return text(psid, "PIN မမှန်ပါ၊ သက်တမ်းကုန်နေပါသည်၊ သို့မဟုတ် ထပ်မံကြိုးစားမှုများလွန်းနေပါသည်။ ဆက်တင်များတွင် PIN အသစ်သတ်မှတ်ပါ။");
    await retryLowStockAlerts(owner);
    return text(psid, lowStockPairingConfirmation());
  }
  const paymentReview = msg.trim().match(/^PAYMENT_REVIEW_(CANCEL_CONFIRM|CANCEL_KEEP|APPROVE|CANCEL):([0-9]{6})$/);
  if (paymentReview) {
    if (shopCurrency?.low_stock_alert_psid !== psid) return text(psid, "ဤလုပ်ဆောင်ချက်ကို Messenger ချိတ်ဆက်ထားသော ဆိုင်ရှင်အကောင့်မှသာ လုပ်နိုင်ပါသည်။");
    return handlePaymentReviewAction(
      db,
      owner,
      psid,
      paymentReview[1] as "APPROVE" | "CANCEL" | "CANCEL_CONFIRM" | "CANCEL_KEEP",
      paymentReview[2]!,
      shopCurrency.currency,
    );
  }
  if (shopCurrency?.low_stock_alert_psid === psid) await retryLowStockAlerts(owner);
  const save = (patch: Partial<Session>) =>
    db.from("messenger_sessions").upsert({ ...s, ...patch, data: (patch.data ?? s.data) as never, updated_at: new Date().toISOString() });
  const startPrepaidPayment = async (
    product: { id: string; code: string; name: string; price: number; unit: string },
    quantity: number,
    previousCustomer?: CustomerDetails | null,
  ) => {
    const { data: bank } = await db.from("shop_settings")
      .select("bank_name, bank_account_name, bank_account_number")
      .eq("owner_id", owner)
      .maybeSingle();
    await save({
      state: "awaiting_payment_proof",
      data: {
        product_id: product.id,
        code: product.code,
        product: product.name,
        price: Number(product.price),
        qty: quantity,
        unit: product.unit,
        prepay_allowed: true,
        payment_method: "prepaid",
        ...(previousCustomer ? { previous_customer: previousCustomer } : {}),
      },
    });
    return text(
      psid,
      `🛒 ပစ္စည်းအမည်: ${product.name}\n🔢 အရေအတွက်: ${formatQuantity(quantity, product.unit)}\n💰 တစ်${normalizeProductUnit(product.unit)}ဈေး: ${fmt(Number(product.price))}\n💵 ပေးချေရန်ပမာဏ: ${fmt(Number(product.price) * quantity)}\n\nငွေလွှဲရန်ဘဏ်အချက်အလက်\nဘဏ်: ${bank?.bank_name ?? "Admin ထံ ဆက်သွယ်ပါ"}\nအကောင့်အမည်: ${bank?.bank_account_name ?? "မသတ်မှတ်ရသေးပါ"}\nအကောင့်နံပါတ်: ${bank?.bank_account_number ?? "မသတ်မှတ်ရသေးပါ"}\n\nငွေလွှဲပြီးပါက ဖြတ်ပိုင်းဓာတ်ပုံကို ဒီ Messenger မှာ ပို့ပါရှင်။`,
    );
  };

  const startSellerDeliveryCash = async (
    product: { id: string; code: string; name: string; price: number; unit: string },
    quantity: number,
    previousCustomer?: CustomerDetails | null,
  ) => {
    const data: Record<string, unknown> = {
      product_id: product.id,
      code: product.code,
      product: product.name,
      price: Number(product.price),
      qty: quantity,
      unit: product.unit,
      prepay_allowed: false,
      payment_method: "seller_delivery_cash",
      ...(previousCustomer ? { previous_customer: previousCustomer } : {}),
    };
    if (previousCustomer) {
      await save({ state: "reuse_customer_details", data });
      return reuseCustomerDetailsChoice(psid, previousCustomer);
    }
    await save({ state: "ask_customer_details", data });
    return text(psid, `ငွေပေးချေမှု: ${paymentMethodLabel("seller_delivery_cash")}\n${paymentMethodInstruction("seller_delivery_cash")}\n\n${customerDetailsRequest("ဝယ်သူအမည်၊ ဖုန်းနံပါတ်၊ ပို့ရမည့်လိပ်စာကို တစ်ခါတည်း ဒီပုံစံနဲ့ ပို့ပါ။")}`);
  };

  const { data: returnedOrders } = await db.from("orders")
    .select("public_order_id, product_code, product_name, product_unit, unit_price, quantity, created_at")
    .eq("owner_id", owner)
    .eq("psid", psid)
    .eq("delivery_status", "returned")
    .order("created_at", { ascending: false })
    .limit(20);
  if (returnedOrders?.length) {
    const history = returnedOrders.map(formatReturnedOrderHistory).join("\n\n");
    const data = s.data as Record<string, unknown>;
    if (msg.trim() === "PREPAY" || msg.trim() === "ငွေကြိုလွှဲမယ်" || msg.trim() === "ငွေကြိုလွှဲပါမည်") {
      const pendingCode = typeof data["pending_code"] === "string" ? data["pending_code"] : "";
      const pendingQty = typeof data["pending_qty"] === "number" ? data["pending_qty"] : null;
      if (pendingCode && pendingQty) {
        const { data: p } = await db.from("products").select("*").eq("owner_id", owner).eq("code", pendingCode).eq("active", true).maybeSingle();
        if (!p) return text(psid, `Code ${pendingCode} ဖြင့် ပစ္စည်းမတွေ့ပါ။`);
        if (p.stock < pendingQty) return text(psid, p.stock ? `${p.name} အတွက် လက်ကျန် ${formatQuantity(p.stock, p.unit)} သာ ရှိပါသည်။` : `${p.name} လက်ကျန်ကုန်ပါပြီ။`);
        // A returned delivery overrides per-product payment options: this customer must prepay.
        if (getProductPaymentFlow(p, { forcePrepaid: true }) === "prepaid") {
          return startPrepaidPayment(p, pendingQty);
        }
        return text(psid, "ပို့ဆောင်မှုမအောင်မြင်ခဲ့သော အော်ဒါရှိပါက အော်ဒါအသစ်ကို ငွေကြိုလွှဲပြီးမှ လက်ခံပါမည်ရှင်။");
      }
      await save({ state: "idle", data: { prepay_allowed: true } });
      return text(psid, "ကြိုတင်ငွေလွှဲစနစ်ကို ရွေးချယ်ပြီးပါပြီ။ ဒီနေ့ အော်ဒါအသစ်အတွက် ပစ္စည်း Code နှင့် အရေအတွက်ကို ပို့ပါ။ ဥပမာ 111=2");
    }
    if (msg.trim() === "NO_BUY" || msg.trim() === "မဝယ်တော့ပါ") {
      await save({ state: "idle", data: {} });
      return text(psid, "ဟုတ်ကဲ့ပါရှင်။ အော်ဒါအသစ် မတင်တော့ပါ။");
    }
    const incoming = parseProductRequest(msg);
    if (incoming?.qty && s.state !== "prepay_choice") {
      await save({ state: "prepay_choice", data: { pending_code: incoming.code, pending_qty: incoming.qty } });
      return paymentChoices(psid, `⚠️ ပို့ဆောင်မှုမအောင်မြင်ခဲ့သော Order ဖြစ်ပါသည်။\n\nအရင်ဝယ်ခဲ့ဖူးသောစာရင်း:\n${history}\n\nပို့ဆောင်မှုမအောင်မြင်ခဲ့သောကြောင့် ဤ Messenger အကောင့်ကို အိမ်ရောက်ငွေချေစနစ် မရတော့ပါရှင်။ ငွေကြိုလွှဲမှသာ ပစ္စည်းထပ်မှာယူနိုင်ပါမယ်ရှင်။`);
    }
    if (!data["prepay_allowed"]) {
      const nextData = incoming?.qty ? { pending_code: incoming.code, pending_qty: incoming.qty } : {};
      await save({ state: "prepay_choice", data: nextData });
      return paymentChoices(psid, `⚠️ ပို့ဆောင်မှုမအောင်မြင်ခဲ့သော Order ဖြစ်ပါသည်။\n\nအရင်ဝယ်ခဲ့ဖူးသောစာရင်း:\n${history}\n\nပို့ဆောင်မှုမအောင်မြင်ခဲ့သောကြောင့် ဤ Messenger အကောင့်ကို အိမ်ရောက်ငွေချေစနစ် မရတော့ပါရှင်။ ငွေကြိုလွှဲမှသာ ပစ္စည်းထပ်မှာယူနိုင်ပါမယ်ရှင်။`);
    }
  }

  const editOrderId = orderCommand(msg, ["ပြင်", "ပြင်ဆင်", "edit"]);
  const cancelOrderId = orderCommand(msg, ["ဖျက်", "ဖျက်မယ်", "cancel"]);
  if (editOrderId || cancelOrderId) {
    const publicOrderId = editOrderId ?? cancelOrderId!;
    const { data: order } = await db.from("orders").select("*").eq("owner_id", owner).eq("psid", psid).eq("public_order_id", publicOrderId).maybeSingle();
    if (!order) return text(psid, `Order ID ${publicOrderId} ကို မတွေ့ပါ။ မိမိ Messenger အကောင့်နဲ့ ဝယ်ယူထားသော Order ID ကိုသာ အသုံးပြုပါ။`);
    if (orderIsLocked(order)) return text(psid, "ဤအော်ဒါကို ပို့ဆောင်ပြီးဖြစ်သောကြောင့် ပြင်ဆင်ခြင်း သို့မဟုတ် ဖျက်ခြင်း မပြုလုပ်နိုင်တော့ပါ။");
    if (cancelOrderId) {
      await save({ state: "cancel_order", data: { public_order_id: publicOrderId, product: order.product_name, unit: order.product_unit, quantity: order.quantity } });
      return confirmation(psid, `Order ID: ${publicOrderId}\nပစ္စည်းအမည်: ${order.product_name}\nအရေအတွက်: ${formatQuantity(order.quantity, order.product_unit)}\n\nဒီအော်ဒါကို ဖျက်မည်မှာ သေချာပါသလား။`);
    }
    await save({ state: "edit_order", data: { public_order_id: publicOrderId, product: order.product_name, unit: order.product_unit, quantity: order.quantity } });
    return text(psid, `Order ID: ${publicOrderId}\nပစ္စည်းအမည်: ${order.product_name}\nလက်ရှိအရေအတွက်: ${formatQuantity(order.quantity, order.product_unit)}\n\nအသစ်ပြောင်းလိုသော အရေအတွက်ကို ဂဏန်းတစ်ခုတည်းဖြင့် ပို့ပါ။ ဥပမာ 5`);
  }

  if (s.state === "confirm" && isNo(msg)) {
    await save({ state: "ask_customer_details", data: s.data });
    return text(psid, customerDetailsRequest("အချက်အလက်အသစ်ကို ဒီပုံစံနဲ့ ပို့ပါရှင်။"));
  }
  if (s.state === "confirm") {
    const confirmData = s.data as { prepay_allowed?: boolean; payment_method?: string };
    if (!confirmData.prepay_allowed && !["prepaid", "seller_delivery_cash"].includes(confirmData.payment_method ?? "")) {
      await save({ state: "payment_method_choice", data: s.data });
      return deliveryPaymentChoices(psid, "ငွေပေးချေမှုနည်းလမ်းကို မရွေးရသေးပါ။ အောက်ပါနည်းလမ်းနှစ်မျိုးထဲမှ ရွေးပါ။");
    }
  }
  if (isNo(msg) && s.state !== "idle" && s.state !== "reuse_customer_details") {
    if (s.state === "cancel_order") {
      await save({ state: "idle", data: {} });
      return text(psid, "အော်ဒါဖျက်ခြင်းကို မလုပ်တော့ပါ။");
    }
    await save({ state: "idle", data: {} });
    return text(psid, "❌ အော်ဒါကို ပယ်ဖျက်လိုက်ပါပြီ။ ပစ္စည်း Code နှင့် အရေအတွက်ကို ထပ်ပို့နိုင်ပါတယ်။");
  }


  type Draft = { product_id?: string; code?: string; product?: string; unit?: string; price?: number; qty?: number; name?: string; phone?: string; address?: string; previous_customer?: CustomerDetails; note?: string; payment_method?: OrderPaymentMethod; prepay_allowed?: boolean; payment_proof_url?: string };
  const d = s.data as Draft;
  const clearCustomerDetails = (draft: Draft): Draft => {
    const cleared = { ...draft };
    delete cleared.previous_customer;
    delete cleared.name;
    delete cleared.phone;
    delete cleared.address;
    return cleared;
  };

  switch (s.state) {
    case "reuse_customer_details": {
      const previousCustomer = previousCustomerFromDraft(d);
      if (!previousCustomer) {
        await save({ state: "ask_customer_details", data: clearCustomerDetails(d) });
        return text(psid, customerDetailsRequest("ဝယ်သူအမည်၊ ဖုန်းနံပါတ်၊ ပို့ရမည့်လိပ်စာကို တစ်ခါတည်း ဒီပုံစံနဲ့ ပို့ပါ။"));
      }
      const choice = parseCustomerDetailsChoice(msg);
      if (choice === "reuse") {
        const nd: Draft = { ...d, ...previousCustomer };
        delete nd.previous_customer;
        await save({ state: "confirm", data: nd });
        const selectedMethod = nd.prepay_allowed ? "prepaid" : nd.payment_method;
        return confirmation(psid, `🧾 အော်ဒါစာရင်း\n${nd.product}=${formatQuantity(nd.qty ?? 0, nd.unit)}\nစုစုပေါင်း: ${fmt(Number(nd.price ?? 0) * Number(nd.qty ?? 0))}\nငွေပေးချေမှု: ${paymentMethodLabel(selectedMethod)}\n${paymentMethodInstruction(selectedMethod)}\n\nအမည်: ${nd.name}\nဖုန်း: ${nd.phone}\nလိပ်စာ: ${nd.address}\n\nအချက်အလက်မှန်ကန်ပါက YES ကိုနှိပ်ပါ။ ပြင်လိုပါက NO ကိုနှိပ်ပါရှင်။`);
      }
      if (choice === "new") {
        await save({ state: "ask_customer_details", data: clearCustomerDetails(d) });
        return text(psid, customerDetailsRequest("အချက်အလက်အသစ်ကို ဒီပုံစံနဲ့ ပို့ပါရှင်။"));
      }
      return reuseCustomerDetailsChoice(psid, previousCustomer);
    }
    case "payment_method_choice": {
      if (msg.trim() === "NO_BUY" || msg.trim() === "မဝယ်တော့ပါ") {
        await save({ state: "idle", data: {} });
        return text(psid, "ဟုတ်ကဲ့ပါရှင်။ အော်ဒါအသစ် မတင်တော့ပါ။");
      }
      const paymentMethod = parsePaymentChoice(msg);
      const { data: p } = await db.from("products")
        .select("*")
        .eq("owner_id", owner)
        .eq("id", String(d.product_id))
        .eq("active", true)
        .maybeSingle();
      if (!p) return text(psid, "ဒီပစ္စည်းကို ထပ်မှာယူ၍မရတော့ပါ။ ပစ္စည်း Code နဲ့ အရေအတွက်ကို ပြန်ပို့ပါရှင်။");
      const quantity = Number(d.qty ?? 0);
      if (p.stock < quantity) {
        return text(psid, p.stock ? `${p.name} အတွက် လက်ကျန် ${formatQuantity(p.stock, p.unit)} သာ ရှိပါသည်။` : `${p.name} လက်ကျန်ကုန်ပါပြီ။`);
      }
      const allowedChoices = getProductPaymentChoices(p);
      if (!paymentMethod) {
        return deliveryPaymentChoices(psid, "ငွေပေးချေမှုနည်းလမ်းကို ရွေးချယ်ရန် အောက်ပါခလုတ်တစ်ခုကို နှိပ်ပါ။", allowedChoices);
      }
      if (!allowedChoices.some((choice) => choice.method === paymentMethod)) {
        return deliveryPaymentChoices(psid, "ဒီပစ္စည်းအတွက် အဲဒီငွေပေးချေနည်းလမ်းကို ဖွင့်မထားပါ။ ဖွင့်ထားသောနည်းလမ်းကို ရွေးပါရှင်။", allowedChoices);
      }
      if (paymentMethod === "prepaid") {
        return startPrepaidPayment(p, quantity, previousCustomerFromDraft(d));
      }
      return startSellerDeliveryCash(p, quantity, previousCustomerFromDraft(d));
    }
    case "edit_order": {
      const quantity = Number(msg.trim());
      if (!/^[1-9][0-9]{0,3}$/.test(msg.trim())) return text(psid, "အရေအတွက်ကို 1 မှ 9999 အတွင်း ဂဏန်းဖြင့်သာ ပို့ပါ။");
      const { data: updated, error } = await callShopRpc(db, "edit_order_by_customer", {
        _owner: owner, _psid: psid, _public_order_id: String((d as { public_order_id?: string }).public_order_id), _qty: quantity,
      });
      await save({ state: "idle", data: {} });
      if (error) return text(psid, error.message.includes("OUT_OF_STOCK") ? "😔 လက်ကျန်မလုံလောက်တော့ပါ။ အရေအတွက်လျှော့ပြီး ထပ်စမ်းပါ။" : "အော်ဒါအရေအတွက်ပြင်ရာတွင် အမှားဖြစ်ပါသည်။");
      const o = updated as unknown as { public_order_id: string; product_name: string; quantity: number; product_id: string | null };
      if (o.product_id) await retryLowStockAlerts(owner, o.product_id);
      return text(psid, `Order ID: ${o.public_order_id}\nပစ္စည်းအမည်: ${o.product_name}\nအရေအတွက်: ${formatQuantity(o.quantity, d.unit)}\n\nအော်ဒါအရေအတွက်ကို ပြင်ဆင်ပြီးပါပြီ။`);
    }
    case "cancel_order": {
      if (!isYes(msg)) return text(psid, "အော်ဒါဖျက်ရန် YES ကိုနှိပ်ပါ။ မဖျက်လိုပါက NO ကိုနှိပ်ပါ။");
      const { data: cancelled, error } = await callShopRpc(db, "cancel_order_by_customer", {
        _owner: owner, _psid: psid, _public_order_id: String((d as { public_order_id?: string }).public_order_id),
      });
      await save({ state: "idle", data: {} });
      if (error) return text(psid, "အော်ဒါဖျက်ရာတွင် အမှားဖြစ်ပါသည်။ ပို့ဆောင်ပြီးသားဖြစ်နိုင်ပါသည်။");
      const cancelledOrder = cancelled as { product_id?: string | null } | null;
      if (cancelledOrder?.product_id) await retryLowStockAlerts(owner, cancelledOrder.product_id);
      return text(psid, `Order ID: ${String((d as { public_order_id?: string }).public_order_id)} ကို ဖျက်ပြီးပါပြီ။`);
    }
    case "ask_customer_details": {
      const details = parseCustomerDetails(msg);
      if (!details) return text(psid, customerDetailsRequest("အမည်၊ ဖုန်းနံပါတ်၊ လိပ်စာကို တစ်ခါတည်း ဒီပုံစံနဲ့ ပြန်ပို့ပါ။"));
      const nd: Draft = { ...d, ...details, note: "" };
      await save({ state: "confirm", data: nd });
      const selectedMethod = nd.prepay_allowed ? "prepaid" : nd.payment_method;
      const imageNotice = detailsFromImage ? "📷 ပုံမှ ဖတ်ထုတ်ထားသော အချက်အလက်ဖြစ်ပါသည်။ အောက်ပါအချက်အလက်များကို စစ်ဆေးပေးပါ။\n\n" : "";
      return confirmation(psid, `${imageNotice}🧾 အော်ဒါစာရင်း\n${nd.product}=${formatQuantity(nd.qty ?? 0, nd.unit)}\nစုစုပေါင်း: ${fmt(Number(nd.price ?? 0) * Number(nd.qty ?? 0))}\nငွေပေးချေမှု: ${paymentMethodLabel(selectedMethod)}\n${paymentMethodInstruction(selectedMethod)}\n\nအမည်: ${nd.name}\nဖုန်း: ${nd.phone}\nလိပ်စာ: ${nd.address}\n\nလိပ်စာမှန်ကန်ရင် YES ကိုနှိပ်ပါ။ ပြင်လိုရင် NO ကိုနှိပ်ပါ။`);
    }
    case "confirm": {
      if (!isYes(msg)) return text(psid, "လိပ်စာမှန်ကန်ရင် “yes” လို့ ပြန်ပို့ပါ။ ပြင်လိုရင် “no” လို့ ပို့ပါ။");
      const baseArgs = {
        _owner: owner, _psid: psid, _product_id: String(d.product_id), _qty: Number(d.qty),
        _name: String(d.name), _phone: String(d.phone), _township: "", _address: String(d.address), _note: String(d.note ?? ""),
      };
      const isPrepaid = Boolean(d.prepay_allowed || d.payment_method === "prepaid");
      const paymentMethod: CashPaymentMethod = d.payment_method === "seller_delivery_cash" ? "seller_delivery_cash" : "courier_cod";
      const { data: order, error } = isPrepaid
        ? await callShopRpc(db, "place_order_from_messenger", baseArgs)
        : await callShopRpc(db, "place_order_from_messenger_with_payment_method", { ...baseArgs, _payment_method: paymentMethod });
      await save({ state: "idle", data: { last_customer: { name: d.name, phone: d.phone, address: d.address } } });
      if (error) return text(psid, error.message.includes("OUT_OF_STOCK") ? "😔 လက်ကျန်မလုံလောက်တော့ပါ။ အရေအတွက်လျှော့ပြီး ထပ်စမ်းပါ။" : "အော်ဒါတင်ရာတွင် အမှားဖြစ်ပါသည်။ ခဏနေပြီး ထပ်စမ်းပါ။");
      const o = order as unknown as { public_order_id?: string; order_no: number; total: number; product_id: string | null };
      if (o.product_id) await retryLowStockAlerts(owner, o.product_id);
      const orderId = o.public_order_id ?? String(o.order_no).padStart(6, "0");
      if (isPrepaid) {
        const proofUrl = String((d as Draft & { payment_proof_url?: string }).payment_proof_url ?? "");
        const { data: submittedProof, error: proofUpdateError } = await db.from("orders")
          .update({ payment_method: "prepaid", payment_status: "proof_submitted", payment_proof_url: proofUrl || null, payment_submitted_at: new Date().toISOString() })
          .eq("owner_id", owner).eq("public_order_id", orderId).eq("psid", psid)
          .neq("payment_status", "proof_submitted").select("id").maybeSingle();
        if (proofUpdateError) console.error("Could not save prepaid payment proof", proofUpdateError.message);
        if (submittedProof && shopCurrency?.low_stock_alert_psid && proofUrl) {
          const reviewMessage = formatPaymentProofReviewMessage({
            orderId,
            product: String(d.product ?? "ပစ္စည်း"),
            quantity: Number(d.qty ?? 0),
            unit: String(d.unit ?? "ခု"),
            total: Number(o.total),
            currency: shopCurrency.currency,
            customerName: String(d.name ?? ""),
            phone: String(d.phone ?? ""),
            address: String(d.address ?? ""),
          });
          const delivery = await sendPaymentProofNotification(shopCurrency.low_stock_alert_psid, reviewMessage, proofUrl, orderId);
          if (!delivery.textSent || !delivery.receiptSent) {
            console.error("Could not deliver prepaid order review to the configured Messenger recipient", delivery.reason);
          }
        }
        return text(psid, `Order ID: ${orderId}\nနာမည်၊ ဖုန်းနံပါတ်၊ လိပ်စာ ရရှိပါပြီရှင်။ ငွေလွှဲဖြတ်ပိုင်းနဲ့အတူ Admin စစ်ဆေးရန် ပို့ထားပါပြီ။ Admin က အတည်ပြုခလုတ်နှိပ်ပြီးမှ ဝယ်ယူမှုအောင်မြင်ပါမယ်ရှင်။`);
      }
      await orderActions(psid, `Order ID: ${orderId}\nပစ္စည်းအမည်: ${d.product}\nအရေအတွက်: ${formatQuantity(d.qty ?? 0, d.unit)}\nငွေပေးချေမှု: ${paymentMethodLabel(paymentMethod)}\n${paymentMethodInstruction(paymentMethod)}\nအမည်: ${d.name}\nဖုန်း: ${d.phone}\nလိပ်စာ: ${d.address}\n\nမပို့ဆောင်မီ အော်ဒါကို ပြင်နိုင်၊ ဖျက်နိုင်ပါသည်။`, orderId);
      if (pageUsername) {
        await send(psid, { attachment: { type: "template", payload: { template_type: "button", text: "နောက်ဆုံးအော်ဒါအခြေအနေများ သိရှိရန် Page ကို Follow လုပ်ထားပါ။", buttons: [{ type: "web_url", url: `https://www.facebook.com/${pageUsername.replace(/^@/, "")}`, title: "Page ကို Follow လုပ်ရန်" }] } } });
      }
      return;
    }
  }

  const req = parseProductRequest(msg);
  if (!req) return text(psid, "ပစ္စည်း Code နှင့် အရေအတွက်ကို ပို့ပါ။ ဥပမာ - 111 2 သို့မဟုတ် 111=2");
  const { data: exactProduct } = await db.from("products").select("*").eq("owner_id", owner).eq("code", req.code).eq("active", true).maybeSingle();
  let p = exactProduct;
  let correction: string | null = null;
  if (!p) {
    const { data: activeProducts, error: productsError } = await db.from("products").select("*").eq("owner_id", owner).eq("active", true);
    if (productsError) return text(psid, "ပစ္စည်းရှာရာတွင် အမှားဖြစ်နေပါသည်။ ခဏနေပြီး ထပ်စမ်းပါရှင်။");
    const match = matchProductCode(req.code, activeProducts ?? []);
    if (match.kind === "ambiguous") {
      const choices = match.candidates.slice(0, 5).map((candidate) => `• ${candidate.code} — ${candidate.name}`).join("\n");
      return text(psid, `ပို့ထားသော Code “${req.code}” နှင့် နီးစပ်သည့် ပစ္စည်းများရှိနေပါသည်။ မှားယွင်းသောပစ္စည်း မရွေးမိစေရန် အလိုအလျောက် မရွေးထားပါ။ အောက်ပါ Code အပြည့်အစုံတစ်ခုနှင့် အရေအတွက်ကို ပြန်ပို့ပါရှင်။\n${choices}`);
    }
    if (match.kind === "matched") {
      p = match.product;
      if (match.distance > 0) correction = `ပို့ထားသော Code “${req.code}” သည် “${p.code}” နှင့် အနည်းငယ်ကွာနေသဖြင့် ဒီပစ္စည်းအဖြစ် ယူဆပြီး ဆက်လုပ်ပါမည်။\n`;
    }
  }
  if (!p) return text(psid, `Code ${req.code} ဖြင့် ပစ္စည်းမတွေ့ပါ။`);
  const { data: shop } = await db.from("shop_settings").select("shop_name").eq("owner_id", owner).maybeSingle();
  if (correction) await text(psid, correction);
  await sendProductCard(psid, p, origin, fmt);

  if (req.qty === null) {
    return text(psid, `🏪 ${shop?.shop_name ?? "ဈေးဆိုင်"}\n\n${p.name}\n💰 တစ်${normalizeProductUnit(p.unit)}ဈေး: ${fmt(Number(p.price))}\n📦 ${p.stock > 0 ? `လက်ကျန် ${formatQuantity(p.stock, p.unit)}` : "လက်ကျန်ကုန်ပါပြီ"}${p.description ? `\n\n${p.description}` : ""}\n\nအော်ဒါတင်ရန် ${p.code} 1 သို့မဟုတ် ${p.code}=2 ပို့ပါ။`);
  }
  if (p.stock < req.qty) return text(psid, p.stock ? `${p.name} အတွက် လက်ကျန် ${formatQuantity(p.stock, p.unit)} သာ ရှိပါသည်။` : `${p.name} လက်ကျန်ကုန်ပါပြီ။`);
  if ((s.data as Record<string, unknown>)["prepay_allowed"]) {
    if (p.allow_prepaid === false) return text(psid, "ဒီပစ္စည်းအတွက် COD/ကြိုတင်ငွေလွှဲနည်းလမ်းကို ဆိုင်က ဖွင့်မထားပါ။ ဆိုင်ရှင်ထံ ဆက်သွယ်ပါရှင်။");
    return startPrepaidPayment(p, req.qty);
  }
  const paymentFlow = getProductPaymentFlow(p);
  const allowedChoices = getProductPaymentChoices(p);
  if (paymentFlow === "unavailable") return text(psid, "ဒီပစ္စည်းအတွက် ငွေပေးချေနည်းလမ်း မသတ်မှတ်ရသေးပါ။ ဆိုင်ရှင်ထံ ဆက်သွယ်ပါရှင်။");
  const { data: previous } = await db.from("orders").select("customer_name, phone, township, address")
    .eq("owner_id", owner).eq("psid", psid).neq("status", "cancelled").order("created_at", { ascending: false }).limit(1).maybeSingle();
  const customer = readCustomerDetails(previous ? { name: previous.customer_name, phone: previous.phone, address: previous.township ? `${previous.township}, ${previous.address}` : previous.address } : s.data["last_customer"]);
  if (paymentFlow === "prepaid") return startPrepaidPayment(p, req.qty, customer);
  if (paymentFlow === "seller_delivery_cash") return startSellerDeliveryCash(p, req.qty, customer);
  const draft = {
    product_id: p.id,
    code: p.code,
    product: p.name,
    unit: p.unit,
    price: Number(p.price),
    qty: req.qty,
    prepay_allowed: false,
    ...(customer ? { previous_customer: customer } : {}),
    note: "",
  };
  await save({ state: "payment_method_choice", data: draft });
  return deliveryPaymentChoices(
    psid,
    `🛒 ${p.name}\n💰 တစ်${normalizeProductUnit(p.unit)}ဈေး: ${fmt(Number(p.price))}\n📦 မှာယူမည့်အရေအတွက်: ${formatQuantity(req.qty, p.unit)}\n💵 စုစုပေါင်း: ${fmt(Number(p.price) * req.qty)}\n\nငွေပေးချေနည်းလမ်းကို ရွေးပါ။\n${paymentChoiceInstructions(allowedChoices)}`,
    allowedChoices,
  );
}

async function handlePaymentProof(db: Admin, owner: string, psid: string, imageUrl: string) {
  const { data: existing } = await db.from("messenger_sessions").select("*").eq("owner_id", owner).eq("psid", psid).maybeSingle();
  const s = existing as Session | null;
  if (!s || s.state !== "awaiting_payment_proof") return text(psid, "ငွေပေးချေရန်စောင့်နေသော အော်ဒါမရှိပါ။ အရင်ဆုံး ပစ္စည်း Code နှင့် အရေအတွက်ကို ပို့ပါရှင်။");
  const data: Record<string, unknown> = { ...(s.data as Record<string, unknown>), payment_proof_url: imageUrl };
  const previousCustomer = readCustomerDetails(data["previous_customer"]);
  await db.from("messenger_sessions").upsert({ ...s, state: previousCustomer ? "reuse_customer_details" : "ask_customer_details", data: data as never, updated_at: new Date().toISOString() });
  if (previousCustomer) return reuseCustomerDetailsChoice(psid, previousCustomer);
  return text(psid, `ငွေလွှဲဖြတ်ပိုင်း ရရှိပါပြီရှင်။\n${customerDetailsRequest("အခု နာမည်၊ ဖုန်းနံပါတ်၊ လိပ်စာကို တစ်ခါတည်း ဒီပုံစံနဲ့ ပို့ပါရှင်။")}`);
}

async function handleCustomerDetailsImage(db: Admin, owner: string, psid: string, imageUrl: string, origin: string, pageUsername?: string | null) {
  const { data: existing, error: sessionError } = await db.from("messenger_sessions").select("*").eq("owner_id", owner).eq("psid", psid).maybeSingle();
  if (sessionError) {
    console.error("Could not check Messenger customer-details state");
    await text(psid, "ပုံကို လုပ်ဆောင်မရပါ။ ခဏနေပြီး နာမည်၊ ဖုန်းနံပါတ်နဲ့ လိပ်စာကို စာသားဖြင့် ပို့ပါရှင်။");
    return true;
  }
  const session = existing as Session | null;
  if (!session || !["ask_customer_details", "reuse_customer_details"].includes(session.state)) return false;

  if (session.state === "reuse_customer_details") {
    const data = { ...session.data };
    delete data["previous_customer"];
    delete data["name"];
    delete data["phone"];
    delete data["address"];
    const { error } = await db.from("messenger_sessions").upsert({ ...session, state: "ask_customer_details", data: data as never, updated_at: new Date().toISOString() });
    if (error) {
      console.error("Could not prepare new Messenger customer details");
      await text(psid, "အချက်အလက်အသစ်ကို လုပ်ဆောင်မရပါ။ ခဏနေပြီး ထပ်ပို့ပါရှင်။");
      return true;
    }
  }

  const extracted = await extractCustomerDetailsFromImageUrl(imageUrl);
  if (!extracted.ok) {
    if (extracted.reason === "missing_key") console.error("LOVABLE_API_KEY is not configured for customer-details image extraction");
    else if (extracted.reason === "provider_error") console.error("Lovable AI customer-details image extraction failed");
    const retryText = extracted.reason === "missing_key"
      ? "ပုံမှ အချက်အလက်ဖတ်ရှုမှုကို မဖွင့်ထားသေးပါ။ နာမည်၊ ဖုန်းနံပါတ်၊ လိပ်စာကို စာသားဖြင့် ပို့ပါရှင်။"
      : extracted.reason === "unreadable"
        ? "ပုံထဲက အမည်၊ ဖုန်းနံပါတ်၊ လိပ်စာကို ဖတ်မရပါ။ ပိုရှင်းသောပုံတစ်ပုံ ထပ်ပို့ပါ၊ သို့မဟုတ် အောက်ပါပုံစံဖြင့် စာသားပို့ပါ။\n" + customerDetailsExample
        : extracted.reason === "image_unavailable"
          ? "Messenger မှ ပုံကို ရယူမရပါ။ ပုံကို ပြန်ပို့ပါ၊ သို့မဟုတ် အောက်ပါပုံစံဖြင့် စာသားပို့ပါ။\n" + customerDetailsExample
          : "ပုံဖတ်ရှုမှု ယာယီအဆင်မပြေပါ။ နာမည်၊ ဖုန်းနံပါတ်နဲ့ လိပ်စာကို အောက်ပါပုံစံဖြင့် စာသားပို့ပါရှင်။\n" + customerDetailsExample;
    await text(psid, retryText);
    return true;
  }

  const detailsMessage = `အမည်: ${extracted.details.name}\nဖုန်း: ${extracted.details.phone}\nလိပ်စာ: ${extracted.details.address}`;
  await handleText(db, owner, psid, detailsMessage, origin, pageUsername, true);
  return true;
}

export const Route = createFileRoute("/api/public/shop-messenger")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const u = new URL(request.url);
        const expected = envFirst("SHOP_FB_VERIFY_TOKEN", "FB_VERIFY_TOKEN");
        console.info("[shop-messenger] webhook verification request", { path: u.pathname, hasVerifyToken: Boolean(u.searchParams.get("hub.verify_token")) });
        const parsed = messengerVerificationSchema.safeParse({
          mode: u.searchParams.get("hub.mode"),
          token: u.searchParams.get("hub.verify_token"),
          challenge: u.searchParams.get("hub.challenge"),
        });
        if (expected && parsed.success && parsed.data.token === expected) {
          return new Response(parsed.data.challenge, { status: 200 });
        }
        return new Response("Forbidden", { status: 403 });
      },
      POST: async ({ request }) => {
        const body = await request.text();
        const signature = request.headers.get("x-hub-signature-256");
        console.info("[shop-messenger] webhook POST received", { path: new URL(request.url).pathname, bodyBytes: body.length, hasSignature: Boolean(signature) });
        const appSecret = envFirst("SHOP_FB_APP_SECRET", "FB_APP_SECRET", "FACEBOOK_APP_SECRET", "META_APP_SECRET");
        const signatureFormatValid = Boolean(signature && /^sha256=[a-f0-9]{64}$/.test(signature));
        if (!(await verifyMessengerSignature(body, signature, appSecret))) {
          console.warn("[shop-messenger] webhook signature rejected", { hasSignature: Boolean(signature), signatureFormatValid, hasAppSecret: Boolean(appSecret) });
          return new Response("Invalid signature", { status: 401 });
        }
        let json: unknown;
        try {
          json = JSON.parse(body);
        } catch {
          console.warn("[shop-messenger] webhook JSON parse failed");
          return new Response("Invalid JSON", { status: 400 });
        }
        const parsed = messengerPayloadSchema.safeParse(json);
        if (!parsed.success) {
          console.warn("[shop-messenger] webhook payload rejected", { issueCount: parsed.error.issues.length });
          return new Response("Invalid Messenger payload", { status: 400 });
        }
        const payload = parsed.data as unknown as {
          object: string;
          entry: {
            id: string;
            changes?: Array<{ field?: string; value?: { item?: string; verb?: string; message?: string; comment_id?: string; from?: { id?: string } } }>;
            messaging?: { sender: { id: string }; message?: { text?: string; is_echo?: boolean; quick_reply?: { payload?: string }; attachments?: Array<{ type?: string; payload?: { url?: string } }> }; postback?: { payload?: string } }[];
          }[];
        };
        if (payload.object !== "page") return new Response("ok");
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const origin = new URL(request.url).origin;
        for (const entry of payload.entry ?? []) {
          console.info("[shop-messenger] page entry received", { hasMessaging: Boolean(entry.messaging?.length), changes: (entry.changes ?? []).map((change) => change.field ?? "unknown") });
          const { data: configuredShops } = await supabaseAdmin.from("shop_settings").select("owner_id, fb_page_id, messenger_username");
          const shop = configuredShops?.find((candidate) => String(candidate.fb_page_id ?? "").trim() === String(entry.id).trim());
          if (!shop) {
            console.warn("[shop-messenger] no shop configured for page entry", {
              receivedPageId: entry.id,
              configuredPageIds: (configuredShops ?? []).map((candidate) => String(candidate.fb_page_id ?? "").trim()).filter(Boolean),
            });
            continue;
          }
          for (const change of entry.changes ?? []) {
            const value = change.value;
            const commentMessage = value?.message?.trim();
            const commenterId = value?.from?.id;
            if (change.field !== "feed" || value?.item !== "comment" || value.verb !== "add" || !value.comment_id || !commenterId || commenterId === entry.id || !commentMessage) continue;
            if (!parseProductRequest(commentMessage)) continue;
            console.info("[shop-messenger] product-code comment accepted", { hasQuantity: Boolean(parseProductRequest(commentMessage)?.qty), hasPrivateReplyTarget: Boolean(value.comment_id) });
            try {
              await sendCommentPrivateReply(value.comment_id, "Product Code ကို Messenger မှာ ဆက်ပြီး အော်ဒါတင်နိုင်အောင် message ပို့ထားပါတယ်ရှင်။");
              await handleText(supabaseAdmin, shop.owner_id, commenterId, commentMessage.slice(0, 1000), origin, shop.messenger_username);
            } catch (error) {
              console.error("shop-messenger comment handler error", (error as Error).message);
            }
          }
          for (const ev of entry.messaging ?? []) {
            const message = ev.message as unknown as { is_echo?: boolean; text?: string; quick_reply?: { payload?: string }; attachments?: Array<{ type?: string; payload?: { url?: string } }> } | undefined;
            const t = message?.is_echo ? undefined : (message?.quick_reply?.payload ?? message?.text ?? ev.postback?.payload);
            const imageUrl = message?.attachments?.find((a) => a.type === "image")?.payload?.url;
            if (imageUrl) {
              try {
                const customerDetailsImageHandled = await handleCustomerDetailsImage(supabaseAdmin, shop.owner_id, ev.sender.id, imageUrl, origin, shop.messenger_username);
                if (!customerDetailsImageHandled) await handlePaymentProof(supabaseAdmin, shop.owner_id, ev.sender.id, imageUrl);
              } catch (error) {
                console.error("shop-messenger image handler error", (error as Error).message);
                await text(ev.sender.id, "ပုံကို လုပ်ဆောင်မရပါ။ နာမည်၊ ဖုန်းနံပါတ်နဲ့ လိပ်စာကို စာသားဖြင့် ပို့ပါရှင်။");
              }
              continue;
            }
            if (!t) continue;
            try {
              await handleText(supabaseAdmin, shop.owner_id, ev.sender.id, t.slice(0, 1000), origin, shop.messenger_username);
            } catch (e) {
              console.error("shop-messenger handler error", (e as Error).message);
              return new Response("Temporary processing error", { status: 500 });
            }
          }
        }
        return new Response("ok");
      },
    },
  },
});
