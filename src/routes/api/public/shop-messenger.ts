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
import { cashPaymentChoices, parseCashPaymentChoice, paymentMethodInstruction, paymentMethodLabel, type CashPaymentMethod } from "@/lib/payment-method";

// Shop Messenger webhook. Secrets (server-only): SHOP_FB_APP_SECRET, SHOP_FB_VERIFY_TOKEN, SHOP_FB_PAGE_ACCESS_TOKEN.
// The FB_* aliases are also accepted so existing Lovable secrets continue to work.

const envFirst = (...names: string[]) => names.map((name) => process.env[name]).find(Boolean);

type Admin = Awaited<typeof import("@/integrations/supabase/client.server")>["supabaseAdmin"];
type Session = { owner_id: string; psid: string; pin_verified: boolean; state: string; data: Record<string, unknown> };
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
    { content_type: "text", title: "ငွေကြိုလွှဲပါမည်", payload: "PREPAY" },
    { content_type: "text", title: "မဝယ်တော့ပါ", payload: "NO_BUY" },
  ],
});
const deliveryPaymentChoices = (psid: string, t: string) => send(psid, {
  text: t,
  quick_replies: [
    ...cashPaymentChoices.map((choice) => ({
      content_type: "text",
      title: choice.quickReplyTitle,
      payload: choice.payload,
    })),
    { content_type: "text", title: "မဝယ်တော့ပါ", payload: "NO_BUY" },
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

function parseCustomerDetails(msg: string) {
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

async function handleText(db: Admin, owner: string, psid: string, msg: string, origin: string, pageUsername?: string | null) {
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
    if (msg.trim() === "PREPAY" || msg.trim() === "ငွေကြိုလွှဲပါမည်") {
      const pendingCode = typeof data["pending_code"] === "string" ? data["pending_code"] : "";
      const pendingQty = typeof data["pending_qty"] === "number" ? data["pending_qty"] : null;
      if (pendingCode && pendingQty) {
        const { data: p } = await db.from("products").select("*").eq("owner_id", owner).eq("code", pendingCode).eq("active", true).maybeSingle();
        if (!p) return text(psid, `Code ${pendingCode} ဖြင့် ပစ္စည်းမတွေ့ပါ။`);
        if (p.stock < pendingQty) return text(psid, p.stock ? `${p.name} အတွက် လက်ကျန် ${formatQuantity(p.stock, p.unit)} သာ ရှိပါသည်။` : `${p.name} လက်ကျန်ကုန်ပါပြီ။`);
        const { data: shop } = await db.from("shop_settings").select("bank_name, bank_account_name, bank_account_number").eq("owner_id", owner).maybeSingle();
        await save({ state: "awaiting_payment_proof", data: { product_id: p.id, code: p.code, product: p.name, price: Number(p.price), qty: pendingQty, unit: p.unit, prepay_allowed: true } });
        return text(psid, `🛒 ပစ္စည်းအမည်: ${p.name}\n🔢 အရေအတွက်: ${formatQuantity(pendingQty, p.unit)}\n💰 တစ်${normalizeProductUnit(p.unit)}ဈေး: ${fmt(Number(p.price))}\n💵 ပေးချေရန်ပမာဏ: ${fmt(Number(p.price) * pendingQty)}\n\nငွေလွှဲရန်ဘဏ်အချက်အလက်\nဘဏ်: ${shop?.bank_name ?? "Admin ထံ ဆက်သွယ်ပါ"}\nအကောင့်အမည်: ${shop?.bank_account_name ?? "မသတ်မှတ်ရသေးပါ"}\nအကောင့်နံပါတ်: ${shop?.bank_account_number ?? "မသတ်မှတ်ရသေးပါ"}\n\nငွေလွှဲပြီးပါက ဖြတ်ပိုင်းဓာတ်ပုံကို ဒီ Messenger မှာ ပို့ပါရှင်။ ဖြတ်ပိုင်းရပြီးမှ နာမည်၊ ဖုန်းနံပါတ်၊ လိပ်စာကို ဆက်တောင်းပါမယ်ရှင်။`);
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
    return text(psid, "အချက်အလက်အသစ်ကို ဒီပုံစံနဲ့ ပို့ပါရှင်။\nအမည်: မောင်မောင်\nဖုန်း: 09xxxxxxxxx\nလိပ်စာ: အိမ်အမှတ်၊ လမ်း၊ မြို့နယ်");
  }
  if (s.state === "confirm") {
    const confirmData = s.data as { prepay_allowed?: boolean; payment_method?: string };
    if (!confirmData.prepay_allowed && !["courier_cod", "seller_delivery_cash"].includes(confirmData.payment_method ?? "")) {
      await save({ state: "payment_method_choice", data: s.data });
      return deliveryPaymentChoices(psid, "ငွေပေးချေမှုနည်းလမ်းကို မရွေးရသေးပါ။ အောက်ပါနည်းလမ်းနှစ်မျိုးထဲမှ ရွေးပါ။");
    }
  }
  if (isNo(msg) && s.state !== "idle") {
    if (s.state === "cancel_order") {
      await save({ state: "idle", data: {} });
      return text(psid, "အော်ဒါဖျက်ခြင်းကို မလုပ်တော့ပါ။");
    }
    await save({ state: "idle", data: {} });
    return text(psid, "❌ အော်ဒါကို ပယ်ဖျက်လိုက်ပါပြီ။ ပစ္စည်း Code နှင့် အရေအတွက်ကို ထပ်ပို့နိုင်ပါတယ်။");
  }


  type Draft = { product_id?: string; code?: string; product?: string; unit?: string; price?: number; qty?: number; name?: string; phone?: string; address?: string; note?: string; payment_method?: CashPaymentMethod; prepay_allowed?: boolean; payment_proof_url?: string };
  const d = s.data as Draft;
  const next = async (state: string, data: Record<string, unknown>, prompt: string) => {
    await save({ state, data });
    return text(psid, prompt);
  };

  switch (s.state) {
    case "payment_method_choice": {
      if (msg.trim() === "NO_BUY" || msg.trim() === "မဝယ်တော့ပါ") {
        await save({ state: "idle", data: {} });
        return text(psid, "ဟုတ်ကဲ့ပါရှင်။ အော်ဒါအသစ် မတင်တော့ပါ။");
      }
      const paymentMethod = parseCashPaymentChoice(msg);
      if (!paymentMethod) {
        return deliveryPaymentChoices(psid, "ငွေပေးချေမှုနည်းလမ်းကို ရွေးချယ်ရန် အောက်ပါခလုတ်တစ်ခုကို နှိပ်ပါ။");
      }
      const nd: Draft = { ...d, payment_method: paymentMethod, prepay_allowed: false };
      if (nd.name && nd.phone && nd.address) {
        await save({ state: "confirm", data: nd });
        return confirmation(psid, `🧾 အော်ဒါစာရင်း\n${nd.product}=${formatQuantity(nd.qty ?? 0, nd.unit)}\nစုစုပေါင်း: ${fmt(Number(nd.price ?? 0) * Number(nd.qty ?? 0))}\nငွေပေးချေမှု: ${paymentMethodLabel(paymentMethod)}\n${paymentMethodInstruction(paymentMethod)}\n\nအမည်: ${nd.name}\nဖုန်း: ${nd.phone}\nလိပ်စာ: ${nd.address}\n\nအချက်အလက်မှန်ကန်ပါက YES ကိုနှိပ်ပါ။ ပြင်လိုပါက NO ကိုနှိပ်ပါရှင်။`);
      }
      await save({ state: "ask_customer_details", data: nd });
      return text(psid, `ငွေပေးချေမှု: ${paymentMethodLabel(paymentMethod)}\n${paymentMethodInstruction(paymentMethod)}\n\nဝယ်သူအမည်၊ ဖုန်းနံပါတ်၊ ပို့ရမည့်လိပ်စာကို တစ်ခါတည်း ဒီပုံစံနဲ့ ပို့ပါ။\nအမည်: မောင်မောင်\nဖုန်း: 09xxxxxxxxx\nလိပ်စာ: အိမ်အမှတ်၊ လမ်း၊ မြို့နယ်`);
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
      if (!details) return text(psid, "အမည်၊ ဖုန်းနံပါတ်၊ လိပ်စာကို တစ်ခါတည်း ဒီပုံစံနဲ့ ပြန်ပို့ပါ။\nအမည်: မောင်မောင်\nဖုန်း: 09xxxxxxxxx\nလိပ်စာ: အိမ်အမှတ်၊ လမ်း၊ မြို့နယ်");
      const nd: Draft = { ...d, ...details, note: "" };
      await save({ state: "confirm", data: nd });
      const selectedMethod = nd.prepay_allowed ? "prepaid" : nd.payment_method;
      return confirmation(psid, `🧾 အော်ဒါစာရင်း\n${nd.product}=${formatQuantity(nd.qty ?? 0, nd.unit)}\nစုစုပေါင်း: ${fmt(Number(nd.price ?? 0) * Number(nd.qty ?? 0))}\nငွေပေးချေမှု: ${paymentMethodLabel(selectedMethod)}\n${paymentMethodInstruction(selectedMethod)}\n\nအမည်: ${nd.name}\nဖုန်း: ${nd.phone}\nလိပ်စာ: ${nd.address}\n\nလိပ်စာမှန်ကန်ရင် YES ကိုနှိပ်ပါ။ ပြင်လိုရင် NO ကိုနှိပ်ပါ။`);
    }
    case "confirm": {
      if (!isYes(msg)) return text(psid, "လိပ်စာမှန်ကန်ရင် “yes” လို့ ပြန်ပို့ပါ။ ပြင်လိုရင် “no” လို့ ပို့ပါ။");
      const baseArgs = {
        _owner: owner, _psid: psid, _product_id: String(d.product_id), _qty: Number(d.qty),
        _name: String(d.name), _phone: String(d.phone), _township: "", _address: String(d.address), _note: String(d.note ?? ""),
      };
      const isPrepaid = Boolean(d.prepay_allowed);
      const paymentMethod: CashPaymentMethod = d.payment_method === "seller_delivery_cash" ? "seller_delivery_cash" : "courier_cod";
      const { data: order, error } = isPrepaid
        ? await callShopRpc(db, "place_order_from_messenger", baseArgs)
        : await callShopRpc(db, "place_order_from_messenger_with_payment_method", { ...baseArgs, _payment_method: paymentMethod });
      await save({ state: "idle", data: { last_customer: { name: d.name, phone: d.phone, address: d.address } } });
      if (error) return text(psid, error.message.includes("OUT_OF_STOCK") ? "😔 လက်ကျန်မလုံလောက်တော့ပါ။ အရေအတွက်လျှော့ပြီး ထပ်စမ်းပါ။" : "အော်ဒါတင်ရာတွင် အမှားဖြစ်ပါသည်။ ခဏနေပြီး ထပ်စမ်းပါ။");
      const o = order as unknown as { public_order_id?: string; order_no: number; total: number; product_id: string | null };
      if (o.product_id) await retryLowStockAlerts(owner, o.product_id);
      const orderId = o.public_order_id ?? String(o.order_no).padStart(6, "0");
      if ((d as Draft & { prepay_allowed?: boolean }).prepay_allowed) {
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
  const { data: p } = await db.from("products").select("*").eq("owner_id", owner).eq("code", req.code).eq("active", true).maybeSingle();
  if (!p) return text(psid, `Code ${req.code} ဖြင့် ပစ္စည်းမတွေ့ပါ။`);
  const { data: shop } = await db.from("shop_settings").select("shop_name").eq("owner_id", owner).maybeSingle();
  await sendProductCard(psid, p, origin, fmt);

  if (req.qty === null) {
    return text(psid, `🏪 ${shop?.shop_name ?? "ဈေးဆိုင်"}\n\n${p.name}\n💰 တစ်${normalizeProductUnit(p.unit)}ဈေး: ${fmt(Number(p.price))}\n📦 ${p.stock > 0 ? `လက်ကျန် ${formatQuantity(p.stock, p.unit)}` : "လက်ကျန်ကုန်ပါပြီ"}${p.description ? `\n\n${p.description}` : ""}\n\nအော်ဒါတင်ရန် ${p.code} 1 သို့မဟုတ် ${p.code}=2 ပို့ပါ။`);
  }
  if (p.stock < req.qty) return text(psid, p.stock ? `${p.name} အတွက် လက်ကျန် ${formatQuantity(p.stock, p.unit)} သာ ရှိပါသည်။` : `${p.name} လက်ကျန်ကုန်ပါပြီ။`);
  if ((s.data as Record<string, unknown>)["prepay_allowed"]) {
    const { data: shop } = await db.from("shop_settings").select("bank_name, bank_account_name, bank_account_number").eq("owner_id", owner).maybeSingle();
    return next("awaiting_payment_proof", { product_id: p.id, code: p.code, product: p.name, unit: p.unit, price: Number(p.price), qty: req.qty, prepay_allowed: true },
      `🛒 ${p.name}\nအရေအတွက်: ${formatQuantity(req.qty, p.unit)}\nပေးချေရန်ပမာဏ: ${fmt(Number(p.price) * req.qty)}\n\nငွေလွှဲရန်ဘဏ်အချက်အလက်\nဘဏ်: ${shop?.bank_name ?? "Admin ထံ ဆက်သွယ်ပါ"}\nအကောင့်အမည်: ${shop?.bank_account_name ?? "မသတ်မှတ်ရသေးပါ"}\nအကောင့်နံပါတ်: ${shop?.bank_account_number ?? "မသတ်မှတ်ရသေးပါ"}\n\nငွေလွှဲပြီးပါက ဖြတ်ပိုင်းဓာတ်ပုံကို ဒီ Messenger မှာ ပို့ပါရှင်။ ဖြတ်ပိုင်းရပြီးမှ နာမည်၊ ဖုန်းနံပါတ်၊ လိပ်စာကို ဆက်တောင်းပါမယ်ရှင်။`);
  }
  const { data: previous } = await db.from("orders").select("customer_name, phone, township, address")
    .eq("owner_id", owner).eq("psid", psid).neq("status", "cancelled").order("created_at", { ascending: false }).limit(1).maybeSingle();
  const lastCustomer = (s.data as { last_customer?: { name?: string; phone?: string; address?: string } }).last_customer;
  const customer = previous ? { name: previous.customer_name, phone: previous.phone, address: previous.township ? `${previous.township}, ${previous.address}` : previous.address } : lastCustomer?.name && lastCustomer.phone && lastCustomer.address ? lastCustomer : null;
  const draft = {
    product_id: p.id,
    code: p.code,
    product: p.name,
    unit: p.unit,
    price: Number(p.price),
    qty: req.qty,
    prepay_allowed: false,
    ...(customer ?? {}),
    note: "",
  };
  await save({ state: "payment_method_choice", data: draft });
  return deliveryPaymentChoices(
    psid,
    `🛒 ${p.name}\n💰 တစ်${normalizeProductUnit(p.unit)}ဈေး: ${fmt(Number(p.price))}\n📦 မှာယူမည့်အရေအတွက်: ${formatQuantity(req.qty, p.unit)}\n💵 စုစုပေါင်း: ${fmt(Number(p.price) * req.qty)}\n\nငွေပေးချေနည်းလမ်းကို ရွေးပါ။\n🚚 COD — ပို့ဆောင်ရေးကုမ္ပဏီက ငွေကောက်ပြီး ဆိုင်သို့ ပြန်လွှဲပေးပါမည်။\n🏠 ဆိုင်မှအိမ်အရောက် — ဆိုင်ဘက်ပို့သူကို ပစ္စည်းလက်ခံချိန် တိုက်ရိုက်ငွေချေပါ။`,
  );
}

async function handlePaymentProof(db: Admin, owner: string, psid: string, imageUrl: string) {
  const { data: existing } = await db.from("messenger_sessions").select("*").eq("owner_id", owner).eq("psid", psid).maybeSingle();
  const s = existing as Session | null;
  if (!s || s.state !== "awaiting_payment_proof") return text(psid, "ငွေပေးချေရန်စောင့်နေသော အော်ဒါမရှိပါ။ အရင်ဆုံး ပစ္စည်း Code နှင့် အရေအတွက်ကို ပို့ပါရှင်။");
  await db.from("messenger_sessions").upsert({ ...s, state: "ask_customer_details", data: { ...s.data, payment_proof_url: imageUrl }, updated_at: new Date().toISOString() });
  return text(psid, "ငွေလွှဲဖြတ်ပိုင်း ရရှိပါပြီရှင်။ အခု နာမည်၊ ဖုန်းနံပါတ်၊ လိပ်စာကို တစ်ခါတည်း ဒီပုံစံနဲ့ ပို့ပါရှင်။\nအမည်: မောင်မောင်\nဖုန်း: 09xxxxxxxxx\nလိပ်စာ: အိမ်အမှတ်၊ လမ်း၊ မြို့နယ်");
}

export const Route = createFileRoute("/api/public/shop-messenger")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const u = new URL(request.url);
        const expected = envFirst("SHOP_FB_VERIFY_TOKEN", "FB_VERIFY_TOKEN");
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
        if (!(await verifyMessengerSignature(body, request.headers.get("x-hub-signature-256"), envFirst("SHOP_FB_APP_SECRET", "FB_APP_SECRET")))) return new Response("Invalid signature", { status: 401 });
        let json: unknown;
        try {
          json = JSON.parse(body);
        } catch {
          return new Response("Invalid JSON", { status: 400 });
        }
        const parsed = messengerPayloadSchema.safeParse(json);
        if (!parsed.success) return new Response("Invalid Messenger payload", { status: 400 });
        const payload = parsed.data as unknown as { object: string; entry: { id: string; messaging?: { sender: { id: string }; message?: { text?: string; is_echo?: boolean; quick_reply?: { payload?: string }; attachments?: Array<{ type?: string; payload?: { url?: string } }> }; postback?: { payload?: string } }[] }[] };
        if (payload.object !== "page") return new Response("ok");
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const origin = new URL(request.url).origin;
        for (const entry of payload.entry ?? []) {
          const { data: shop } = await supabaseAdmin.from("shop_settings").select("owner_id, messenger_username").eq("fb_page_id", entry.id).maybeSingle();
          if (!shop) continue;
          for (const ev of entry.messaging ?? []) {
            const message = ev.message as unknown as { is_echo?: boolean; text?: string; quick_reply?: { payload?: string }; attachments?: Array<{ type?: string; payload?: { url?: string } }> } | undefined;
            const t = message?.is_echo ? undefined : (message?.quick_reply?.payload ?? message?.text ?? ev.postback?.payload);
            const imageUrl = message?.attachments?.find((a) => a.type === "image")?.payload?.url;
            if (imageUrl) {
              await handlePaymentProof(supabaseAdmin, shop.owner_id, ev.sender.id, imageUrl);
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
