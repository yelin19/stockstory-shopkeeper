import { createFileRoute } from "@tanstack/react-router";
import { parseProductRequest, isYes, isNo } from "@/lib/messenger-parse";
import { messengerPayloadSchema, messengerVerificationSchema, verifyMessengerSignature } from "@/lib/messenger-webhook";
import { formatCurrency } from "@/lib/currency";
import { dispatchLowStockAlerts } from "@/lib/low-stock-alert.server";
import { lowStockPairingConfirmation, parseLowStockPairPin } from "@/lib/low-stock-alert";
import { productPageUrl } from "@/lib/shop-data";
import { formatQuantity, normalizeProductUnit } from "@/lib/product-unit";
import { formatPaymentProofReviewMessage, sendPaymentProofNotification } from "@/lib/payment-proof-notification.server";
import { customerPaymentChoices, getProductPaymentChoices, getProductPaymentFlow, parsePaymentChoice, paymentMethodInstruction, paymentMethodLabel, type CashPaymentMethod, type OrderPaymentMethod } from "@/lib/payment-method";
import { parseCustomerDetailsChoice } from "@/lib/customer-details-choice";
import { matchProductCode } from "@/lib/product-code-match";
import { handleProductComment, maskFacebookId, sendPrivateReply, webhookLog } from "@/lib/messenger-comment.server";
import { extractCustomerDetailsFromImageUrl } from "@/lib/customer-details-image.server";
import { generateNaturalShopReply, understandOrderMessage } from "@/lib/gemini-order.server";

// Shop Messenger webhook. Secrets (server-only): SHOP_FB_APP_SECRET, SHOP_FB_VERIFY_TOKEN, SHOP_FB_PAGE_ACCESS_TOKEN.
// The FB_* aliases are also accepted so existing Lovable secrets continue to work.

const envFirst = (...names: string[]) => names.map((name) => process.env[name]).find(Boolean);

type Admin = Awaited<typeof import("@/integrations/supabase/client.server")>["supabaseAdmin"];
type Session = { owner_id: string; psid: string; pin_verified: boolean; state: string; data: Record<string, unknown> };
type CustomerDetails = { name: string; phone: string; address: string };
type CartItem = { product_id: string; code: string; product: string; unit: string; price: number; qty: number };
type CartDraft = { cart?: CartItem[]; product_id?: string; code?: string; product?: string; unit?: string; price?: number; qty?: number; name?: string; phone?: string; address?: string; previous_customer?: CustomerDetails; note?: string; payment_method?: OrderPaymentMethod; prepay_allowed?: boolean; payment_proof_url?: string };
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

type ChatMessage = { role: "customer" | "shop"; text: string };
const loadChatHistory = async (db: Admin, owner: string, psid: string): Promise<ChatMessage[]> => {
  const { data, error } = await db.from("messenger_chat_messages")
    .select("role, message")
    .eq("owner_id", owner)
    .eq("psid", psid)
    .order("created_at", { ascending: false })
    .limit(20);
  if (error) {
    console.error("Could not load Messenger chat history", error.code, error.message);
    return [];
  }
  return (data ?? []).reverse().map((row) => ({
    role: row.role === "shop" ? "shop" : "customer",
    text: String(row.message ?? "").slice(0, 500),
  }));
};
const rememberChatMessage = async (db: Admin, owner: string, psid: string, role: ChatMessage["role"], message: string) => {
  if (!message.trim() || psid.startsWith("comment:")) return;
  const { error } = await db.from("messenger_chat_messages").insert({
    owner_id: owner, psid, role, message: message.trim().slice(0, 2000),
  });
  if (error) console.error("Could not save Messenger chat history", error.message);
};
const normalizeBotText = (value: string) => value
  .toLocaleLowerCase()
  .replace(/[၊။!?၊,\.\-_/]+/g, " ")
  .replace(/\s+/g, " ")
  .trim();
const publicShopUrl = "https://stockstory-shopkeeper.lovable.app/shop";
const isCatalogQuestion = (message: string) => {
  const normalized = message.toLocaleLowerCase().replace(/[၊။!?၊,\.\-_/]+/g, " ").replace(/\s+/g, " ").trim();
  return /ဘာ\s*(တွေ|များ)?\s*(ရောင်း|ရှိ)|ဘာ\s*ပစ္စည်း(တွေ|များ)?\s*(ရောင်း|ရှိ)|ဘာ\s*(ဝယ်|မှာ)လို့ရ|ပစ္စည်း\s*(စာရင်း|list)|product\s*(list|catalog)|what\s*(do you|is)\s*(sell|have)|show\s*(me\s*)?(products|items)/i.test(normalized);
};
const findSavedBotReply = async (db: Admin, owner: string, message: string) => {
  const { data, error } = await db.from("bot_replies")
    .select("question,answer,quick_replies")
    .eq("owner_id", owner)
    .eq("enabled", true)
    .order("created_at", { ascending: true })
    .limit(500);
  if (error) {
    if (!["42P01", "PGRST205"].includes(error.code)) console.error("Could not load saved bot replies", error.code, error.message);
    return null;
  }
  const normalized = normalizeBotText(message);
  const match = (data ?? []).find((row) => normalizeBotText(String(row.question ?? "")) === normalized);
  if (!match) return null;
  const rawQuickReplies = typeof match.quick_replies === "string"
    ? (() => { try { return JSON.parse(match.quick_replies); } catch { return []; } })()
    : match.quick_replies;
  const quickReplies = Array.isArray(rawQuickReplies) ? rawQuickReplies
    .map((choice) => {
      if (typeof choice === "string") return { title: choice.trim(), payload: choice.trim() };
      if (choice && typeof choice === "object") {
        const item = choice as { title?: unknown; payload?: unknown };
        return { title: String(item.title ?? "").trim(), payload: String(item.payload ?? item.title ?? "").trim() };
      }
      return { title: "", payload: "" };
    })
    .filter((choice) => choice.title && choice.payload).slice(0, 3) : [];
  const answer = String(match.answer ?? "").trim();
  return answer ? { answer, quickReplies } : null;
};
const claimMessengerEvent = async (db: Admin, owner: string, eventId: string) => {
  if (!eventId) return true;
  const { error } = await db.from("messenger_event_receipts").insert({ owner_id: owner, event_id: eventId });
  if (error?.code === "42P01" || error?.code === "PGRST205") {
    console.error("Messenger event deduplication table is not migrated yet");
    return true;
  }
  if (error?.code === "23505") {
    webhookLog("duplicate Messenger event skipped", {});
    return false;
  }
  if (error) throw new Error("messenger_event_claim_failed");
  return true;
};
const isDeterministicProductRequest = (message: string) => {
  const parsed = parseProductRequest(message);
  if (!parsed) return false;
  // A quantity makes the customer’s intent explicit. Without a quantity,
  // accept only code-shaped text; Burmese sentences such as “ဖုန်းရောင်းလား”
  // must go through Gemini’s conversational/product-question layer.
  return parsed.qty !== null || /^[A-Za-z0-9_-]{1,32}$/.test(parsed.code);
};

async function send(psid: string, message: Record<string, unknown>) {
  const token = envFirst("SHOP_FB_PAGE_ACCESS_TOKEN", "FB_PAGE_ACCESS_TOKEN");
  if (!token) return;
  const res = await fetch(`https://graph.facebook.com/v21.0/me/messages?access_token=${encodeURIComponent(token)}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ recipient: { id: psid }, messaging_type: "RESPONSE", message }),
  });
  if (!res.ok) console.error("Messenger send failed", res.status, (await res.text().catch(() => "")).slice(0, 500));
}
const text = (psid: string, t: string) => send(psid, { text: t });
const decodeCartPayload = (message: string): Array<{ code: string; qty: number }> | null => {
  const trimmed = message.trim();
  if (trimmed.startsWith("CART_ORDER")) {
    const items: Array<{ code: string; qty: number }> = [];
    for (const line of trimmed.split(/\r?\n/).slice(1)) {
      const match = line.match(/^\s*\d+\.\s+.+?\s+[—-]\s+([0-9]+)\s+[^\[]*\[([^\]]+)\]\s*$/);
      if (!match) continue;
      const qty = Number(match[1]);
      const code = match[2]!.trim();
      if (!code || !Number.isInteger(qty) || qty < 1 || qty > 9999) return null;
      items.push({ code, qty });
    }
    return items.length > 0 && items.length <= 50 ? items : null;
  }
  if (!trimmed.startsWith("CART:")) return null;
  try {
    const value = JSON.parse(atob(trimmed.slice(5))) as unknown;
    if (!Array.isArray(value) || value.length < 1 || value.length > 50) return null;
    const items = value.map((item) => {
      const row = item as { code?: unknown; qty?: unknown };
      const code = String(row.code ?? "").trim();
      const qty = Number(row.qty);
      if (!code || !Number.isInteger(qty) || qty < 1 || qty > 9999) throw new Error("invalid_cart");
      return { code, qty };
    });
    return items;
  } catch { return null; }
};
type SavedBotReply = { answer: string; quickReplies: Array<{ title: string; payload: string }> };
const sendSavedBotReply = (psid: string, reply: SavedBotReply) => send(psid, {
  text: reply.answer,
  ...(reply.quickReplies.length > 0 ? { quick_replies: reply.quickReplies.map((choice) => ({
    content_type: "text",
    title: choice.title.slice(0, 20),
    payload: choice.payload.slice(0, 1000),
  })) } : {}),
});
async function sendCommentPrivateReply(pageId: string, commentId: string, message: string, pageToken?: string | null) {
  return sendPrivateReply(pageId, commentId, message, pageToken || envFirst("SHOP_FB_PAGE_ACCESS_TOKEN", "FB_PAGE_ACCESS_TOKEN"));
}
const customerDetailsPhotoDisclosure = "အချက်အလက်အသစ်ကို စာသားဖြင့်ပို့နိုင်သလို အမည်၊ ဖုန်းနံပါတ်နှင့် လိပ်စာပါသော ပုံကိုလည်း ပို့နိုင်ပါသည်။";
const customerDetailsExample = "အမည်: မောင်မောင်\nဖုန်း: 09xxxxxxxxx\nလိပ်စာ: အိမ်အမှတ်၊ လမ်း၊ မြို့နယ်";
const customerDetailsRequest = (intro: string) => `${intro}\n${customerDetailsExample}\n\n${customerDetailsPhotoDisclosure}`;
async function sendUpdate(psid: string, messageText: string, cancellableOrderId?: string) {
  const token = envFirst("SHOP_FB_PAGE_ACCESS_TOKEN", "FB_PAGE_ACCESS_TOKEN");
  if (!token) return false;
  try {
    const response = await fetch(`https://graph.facebook.com/v21.0/me/messages?access_token=${encodeURIComponent(token)}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        recipient: { id: psid },
        messaging_type: "UPDATE",
        message: {
          text: messageText,
          ...(cancellableOrderId ? {
            quick_replies: [{ content_type: "text", title: "မယူတော့ဘူး", payload: `မယူတော့ဘူး ${cancellableOrderId}` }],
          } : {}),
        },
      }),
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
    { content_type: "text", title: "လိပ်စာအဟောင်းသုံးမည်", payload: "REUSE_CUSTOMER_DETAILS" },
    { content_type: "text", title: "လိပ်စာအသစ်ထည့်မည်", payload: "ENTER_CUSTOMER_DETAILS" },
  ],
});
const orderActions = (psid: string, t: string, orderId: string, includeEdit = true) => send(psid, {
  text: t,
  quick_replies: [
    ...(includeEdit ? [{ content_type: "text", title: "ပြင်မည်", payload: `ပြင် ${orderId}` }] : []),
    { content_type: "text", title: "မယူတော့ဘူး", payload: `မယူတော့ဘူး ${orderId}` },
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
    .select("id, psid, public_order_id, order_no, product_name, product_unit, quantity, total, status, payment_status, product_id, delivery_status, sent, currency")
    .eq("owner_id", owner).eq("public_order_id", orderId).order("created_at", { ascending: true }).limit(1).maybeSingle();
  if (orderError) return text(adminPsid, "Order အချက်အလက်ကို ဖတ်မရပါ။ အက်ပ်ထဲတွင် စစ်ဆေးပါ။");
  if (!order) return text(adminPsid, `Order ID: ${orderId} ကို မတွေ့ပါ။`);
  const { data: orderGroup, error: groupError } = await db.from("orders")
    .select("id, psid, product_name, product_unit, quantity, total, status, payment_status, product_id, delivery_status, sent, currency")
    .eq("owner_id", owner).eq("public_order_id", orderId).order("created_at", { ascending: true });
  if (groupError) return text(adminPsid, "Order အုပ်စုအချက်အလက်ကို ဖတ်မရပါ။ အက်ပ်ထဲတွင် စစ်ဆေးပါ။");
  const group = orderGroup ?? [order];
  const groupIds = group.map((item) => item.id);
  const groupProducts = group.map((item) => `${item.product_name} × ${item.quantity}${item.product_unit ? ` ${item.product_unit}` : ""}`).join(", ");
  const groupTotal = group.reduce((sum, item) => sum + Number(item.total), 0);
  if (action === "CANCEL_KEEP") return text(adminPsid, `Order ID: ${orderId} ကို မပယ်ဖျက်တော့ပါ။`);
  if (group.every((item) => item.status === "cancelled")) return text(adminPsid, `Order ID: ${orderId} ကို ပယ်ဖျက်ပြီးဖြစ်ပါသည်။`);
  if (group.some((item) => item.payment_status !== "proof_submitted")) return text(adminPsid, `Order ID: ${orderId} ၏ ငွေလွှဲဖြတ်ပိုင်းကို စစ်ဆေးပြီးဖြစ်ပါသည်။`);
  if (group.some((item) => orderIsLocked(item))) return text(adminPsid, `Order ID: ${orderId} ကို ပို့ဆောင်ရေးအခြေအနေကြောင့် ယခု မပြင်ဆင်နိုင်ပါ။`);

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
      .eq("owner_id", owner).in("id", groupIds).eq("payment_status", "proof_submitted")
      .select("id");
    if (approvalError) return text(adminPsid, "ငွေပေးချေမှုကို အတည်ပြုမရပါ။ အက်ပ်ထဲတွင် ထပ်စစ်ပါ။");
    if (!approved?.length) return text(adminPsid, `Order ID: ${orderId} ၏ ငွေလွှဲဖြတ်ပိုင်းကို စစ်ဆေးပြီးဖြစ်ပါသည်။`);
    const buyerMessage = `✅ Order ID: ${orderId} ကို Admin မှ ငွေပေးချေမှုအတည်ပြုပြီးပါပြီရှင်။\nပစ္စည်းများ: ${groupProducts}\nပေးချေပြီးငွေ: ${formatCurrency(groupTotal, currency ?? order.currency)}\nမကြာမီ ပို့ဆောင်ပေးပါမယ်ရှင်။`;
    if (order.psid && !(await sendUpdate(order.psid, buyerMessage, orderId))) console.error("Could not notify customer that prepaid order was approved");
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
    .eq("owner_id", owner).in("id", groupIds).eq("payment_status", "proof_submitted");
  if (paymentError) console.error("Could not mark cancelled payment proof as rejected", paymentError.message);
  for (const item of group) if (item.product_id) await retryLowStockAlerts(owner, item.product_id);
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
  if (s.state === "idle" && isCatalogQuestion(msg)) {
    const catalogReply = `ဆိုင်မှာရောင်းနေတဲ့ ပစ္စည်းတွေ၊ လက်ကျန်နဲ့ ဈေးနှုန်းတွေကို ဒီလင့်မှာ ဝင်ကြည့်နိုင်ပါတယ်ရှင်။\n${publicShopUrl}\n\nပစ္စည်းတစ်ခုချင်းစီကို နှိပ်ပြီး ဖော်ပြချက်ကြည့်နိုင်သလို Cart ထဲထည့်ပြီး Messenger ကနေ အော်ဒါတင်နိုင်ပါတယ်ရှင်။`;
    await rememberChatMessage(db, owner, psid, "shop", catalogReply);
    return text(psid, catalogReply);
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
  await rememberChatMessage(db, owner, psid, "customer", msg);
  const persistentHistory = await loadChatHistory(db, owner, psid);
  const sessionHistory = Array.isArray((s.data as { chat?: unknown }).chat)
    ? ((s.data as { chat: ChatMessage[] }).chat).slice(-20)
    : [];
  const chatHistory = persistentHistory.length > 0 ? persistentHistory : sessionHistory;
  if (s.state === "idle") {
    const savedBotReply = await findSavedBotReply(db, owner, msg);
    if (savedBotReply) {
      await rememberChatMessage(db, owner, psid, "shop", savedBotReply.answer);
      webhookLog("saved bot reply sent", { quickReplyCount: savedBotReply.quickReplies.length });
      return sendSavedBotReply(psid, savedBotReply);
    }
  }
  if (s.state === "idle") {
    const cartRequest = decodeCartPayload(msg);
    if (cartRequest) {
      const { data: cartProducts } = await db.from("products")
        .select("id,code,name,unit,price,stock,allow_prepaid,allow_seller_delivery_cash")
        .eq("owner_id", owner).eq("active", true)
        .in("code", cartRequest.map((item) => item.code));
      const byCode = new Map((cartProducts ?? []).map((product) => [product.code.toLocaleLowerCase(), product]));
      const cart: CartItem[] = [];
      for (const item of cartRequest) {
        const product = byCode.get(item.code.toLocaleLowerCase());
        if (!product) return text(psid, `${item.code} ပစ္စည်းကို မတွေ့ပါရှင်။ Cart ကို ပြန်ဖွင့်ပြီး ထပ်စမ်းပါ။`);
        if (Number(product.stock) < item.qty) return text(psid, `${product.name} အတွက် လက်ကျန် ${formatQuantity(Number(product.stock), product.unit)} သာရှိပါသည်။ Cart ထဲမှာ အရေအတွက်လျှော့ပြီး ထပ်စမ်းပါရှင်။`);
        cart.push({ product_id: product.id, code: product.code, product: product.name, unit: product.unit, price: Number(product.price), qty: item.qty });
      }
      const total = cart.reduce((sum, item) => sum + item.price * item.qty, 0);
      const allPrepaid = (cartProducts ?? []).every((product) => product.allow_prepaid);
      const allSellerCash = (cartProducts ?? []).every((product) => product.allow_seller_delivery_cash);
      if (!allPrepaid && !allSellerCash) return text(psid, "Cart ထဲက ပစ္စည်းများတွင် ငွေပေးချေနည်းလမ်း မတူညီသောကြောင့် တစ်မျိုးတည်းဖြင့် အော်ဒါတင်၍မရပါရှင်။ ပစ္စည်းတစ်မျိုးချင်းစီ အော်ဒါတင်ပေးပါ။");
      const { data: previousOrder } = await db.from("orders")
        .select("customer_name,phone,address")
        .eq("owner_id", owner).eq("psid", psid)
        .order("created_at", { ascending: false }).limit(1).maybeSingle();
      const previousCustomer = previousOrder
        ? readCustomerDetails({ name: previousOrder.customer_name, phone: previousOrder.phone, address: previousOrder.address })
        : readCustomerDetails(s.data["last_customer"]);
      const data: CartDraft = {
        cart,
        prepay_allowed: allPrepaid,
        payment_method: allPrepaid ? "prepaid" : "seller_delivery_cash",
        ...(previousCustomer ? { previous_customer: previousCustomer } : {}),
      };
      await save({ state: "cart_confirm", data });
      const lines = cart.map((item) => `• ${item.product} × ${formatQuantity(item.qty, item.unit)} = ${fmt(item.price * item.qty)}`).join("\n");
      return confirmation(psid, `🛒 Cart အော်ဒါစာရင်း\n${lines}\n\nစုစုပေါင်း: ${fmt(total)}\nငွေပေးချေမှု: ${paymentMethodLabel(data.payment_method)}\n\nဒီပစ္စည်းများအားလုံးကို မှာယူမှာ သေချာပါသလား။ YES ကိုနှိပ်ပါ၊ မယူတော့ပါက NO ကိုနှိပ်ပါရှင်။`);
    }
  }
  const isGreeting = /^(မင်္ဂလာပါ|မဂ်လာပါ|မင်္ဂလာပါရှင်|ဟယ်လို|hello|hi|ဟိုင်း|နေကောင်းလား|မေးချင်လို့ပါ)[\s!။၊,.]*$/i.test(msg.trim());
  if (isGreeting) {
    const { data: greetingCatalog } = await db.from("products")
      .select("code,name,category,unit,price,stock")
      .eq("owner_id", owner)
      .eq("active", true)
      .limit(80);
    await save({ state: "idle", data: {} });
    const greetingReply = await generateNaturalShopReply(msg, (greetingCatalog ?? []) as Array<{ code: string; name: string; category?: string | null; unit?: string | null; price?: number | null; stock?: number | null }>, [], chatHistory);
    if (greetingReply) await rememberChatMessage(db, owner, psid, "shop", greetingReply);
    return text(psid, greetingReply ?? "မင်္ဂလာပါရှင်။ ဘာပစ္စည်းလေး ကြည့်ချင်ပါသလဲရှင်။");
  }
  // Gemini is an optional natural-language layer. Product codes and all existing
  // confirmation/payment/customer flows remain deterministic below.
  if (s.state === "idle" && !isDeterministicProductRequest(msg)) {
    const { data: catalog } = await db.from("products")
      .select("code,name,category,unit,price,stock")
      .eq("owner_id", owner)
      .eq("active", true)
      .limit(150);
    const products = (catalog ?? []) as Array<{ code: string; name: string; category?: string | null; unit?: string | null; price?: number | null; stock?: number | null }>;
    const normalizedMessage = msg.trim().toLocaleLowerCase();
    const namedProduct = products
      .filter((product) => product.name.trim().length >= 2 && normalizedMessage.includes(product.name.trim().toLocaleLowerCase()))
      .sort((a, b) => b.name.trim().length - a.name.trim().length)[0];
    const likelyOrderIntent = /မှာ|ယူ|ဝယ်|အော်ဒါ|order|buy|လိုချင်/i.test(msg) || /[0-9၀-၉]/.test(msg);
    // General questions should use one conversational request only. Calling
    // the intent extractor first for every message consumes the free quota twice.
    const intent = namedProduct || !likelyOrderIntent ? null : await understandOrderMessage(msg, products);
    if (namedProduct) {
      // A product-name question such as “ဖိနပ်ရှိလား” should be treated as a
      // product lookup, not as an invalid product code.
      msg = namedProduct.code;
      webhookLog("Product name lookup accepted", { code: namedProduct.code });
    }
    if (intent) {
      webhookLog("Gemini order intent accepted", { code: intent.code, quantity: intent.quantity });
      msg = `${intent.code}=${intent.quantity}`;
    } else if (!namedProduct) {
      const { data: myOrders } = await db.from("orders")
        .select("public_order_id,product_name,quantity,total,status,payment_status,delivery_status,tracking_number,tracking_url,created_at")
        .eq("owner_id", owner).eq("psid", psid)
        .order("created_at", { ascending: false }).limit(5);
      const { data: described } = await db.from("products").select("code,description").eq("owner_id", owner).eq("active", true).limit(150);
      const descMap = new Map((described ?? []).map((p) => [p.code, p.description]));
      const history = chatHistory;
      const naturalReply = await generateNaturalShopReply(
        msg,
        products.map((p) => ({ ...p, description: descMap.get(p.code) ?? null })),
        (myOrders ?? []) as never,
        history,
      );
      if (naturalReply) {
        await rememberChatMessage(db, owner, psid, "shop", naturalReply);
        await save({ data: { ...s.data, chat: [...history, { role: "customer", text: msg.slice(0, 300) }, { role: "shop", text: naturalReply.slice(0, 300) }].slice(-8) } });
        webhookLog("Gemini natural reply sent", {});
        return text(psid, naturalReply);
      }
    }
  }
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

  const editOrderId = orderCommand(msg, ["ပြင်", "ပြင်ဆင်", "edit"]);
  const cancelOrderId = orderCommand(msg, ["ဖျက်", "ဖျက်မယ်", "မယူတော့ဘူး", "မယူတော့ပါ", "cancel"]);
  if (editOrderId || cancelOrderId) {
    const publicOrderId = editOrderId ?? cancelOrderId!;
    const { data: order } = await db.from("orders").select("*").eq("owner_id", owner).eq("psid", psid).eq("public_order_id", publicOrderId).order("created_at", { ascending: true }).limit(1).maybeSingle();
    if (!order) return text(psid, `Order ID ${publicOrderId} ကို မတွေ့ပါ။ မိမိ Messenger အကောင့်နဲ့ ဝယ်ယူထားသော Order ID ကိုသာ အသုံးပြုပါ။`);
    if (orderIsLocked(order)) return text(psid, "ဤအော်ဒါကို ပို့ဆောင်ပြီးဖြစ်သောကြောင့် ပြင်ဆင်ခြင်း သို့မဟုတ် ဖျက်ခြင်း မပြုလုပ်နိုင်တော့ပါ။");
    if (cancelOrderId) {
      const { data: cancelled, error: cancelError } = await callShopRpc(db, "cancel_order_by_customer", {
        _owner: owner, _psid: psid, _public_order_id: publicOrderId,
      });
      const customer = { name: order.customer_name, phone: order.phone, address: order.address };
      await save({ state: "idle", data: { last_customer: customer } });
      if (cancelError || !cancelled) return text(psid, "အော်ဒါကို ချက်ချင်းဖျက်မရပါ။ ပို့ဆောင်ပြီးသားဖြစ်နိုင်ပါသည်။");
      const cancelledOrder = cancelled as { product_id?: string | null };
      if (cancelledOrder.product_id) await retryLowStockAlerts(owner, cancelledOrder.product_id);
      return text(psid, `Order ID: ${publicOrderId} ကို ချက်ချင်းဖျက်ပြီးပါပြီရှင်။ Stock ကိုလည်း ပြန်ထည့်ပြီးပါပြီ။`);
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

  if (s.state === "awaiting_payment_proof") {
    return text(psid, "ငွေကြိုလွှဲအော်ဒါတင်ရန် ငွေလွှဲပြီးသားဖြတ်ပိုင်းဓာတ်ပုံကို ဒီ Messenger မှာ ပို့ပေးပါရှင်။ ပုံမပို့ရသေးသဖြင့် အော်ဒါကို မတင်ရသေးပါ။ မဝယ်တော့ပါက NO ကိုပို့နိုင်ပါတယ်ရှင်။");
  }


  type Draft = CartDraft;
  const d = s.data as Draft;
  const clearCustomerDetails = (draft: Draft): Draft => {
    const cleared = { ...draft };
    delete cleared.previous_customer;
    delete cleared.name;
    delete cleared.phone;
    delete cleared.address;
    return cleared;
  };
  const draftItems = (draft: Draft) => draft.cart?.length
    ? draft.cart.map((item) => `• ${item.product} × ${formatQuantity(item.qty, item.unit)} = ${fmt(item.price * item.qty)}`).join("\n")
    : `${draft.product}=${formatQuantity(draft.qty ?? 0, draft.unit)}`;
  const draftTotal = (draft: Draft) => draft.cart?.length
    ? draft.cart.reduce((sum, item) => sum + item.price * item.qty, 0)
    : Number(draft.price ?? 0) * Number(draft.qty ?? 0);

  switch (s.state) {
    case "cart_confirm": {
      if (isNo(msg)) { await save({ state: "idle", data: {} }); return text(psid, "ဟုတ်ကဲ့ပါရှင်။ Cart အော်ဒါကို မတင်တော့ပါ။"); }
      if (!isYes(msg)) return confirmation(psid, "Cart ထဲက ပစ္စည်းများအားလုံးကို မှာယူမှာ သေချာပါသလား။ YES သို့မဟုတ် NO ကိုနှိပ်ပါရှင်။");
      const previousCustomer = previousCustomerFromDraft(d);
      await save({ state: previousCustomer ? "reuse_customer_details" : "ask_customer_details", data: d });
      return previousCustomer ? reuseCustomerDetailsChoice(psid, previousCustomer) : text(psid, customerDetailsRequest("ဝယ်သူအမည်၊ ဖုန်းနံပါတ်၊ ပို့ရမည့်လိပ်စာကို တစ်ခါတည်း ဒီပုံစံနဲ့ ပို့ပါ။"));
    }
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
        return confirmation(psid, `🧾 အော်ဒါစာရင်း\n${draftItems(nd)}\nစုစုပေါင်း: ${fmt(draftTotal(nd))}\nငွေပေးချေမှု: ${paymentMethodLabel(selectedMethod)}\n${paymentMethodInstruction(selectedMethod)}\n\nအမည်: ${nd.name}\nဖုန်း: ${nd.phone}\nလိပ်စာ: ${nd.address}\n\nအချက်အလက်မှန်ကန်ပါက YES ကိုနှိပ်ပါ။ ပြင်လိုပါက NO ကိုနှိပ်ပါရှင်။`);
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
      if (!isYes(msg)) return text(psid, "အော်ဒါမယူတော့ရန် YES ကိုနှိပ်ပါ။ မဖျက်လိုပါက NO ကိုနှိပ်ပါ။");
      const { data: cancelled, error } = await callShopRpc(db, "cancel_order_by_customer", {
        _owner: owner, _psid: psid, _public_order_id: String((d as { public_order_id?: string }).public_order_id),
      });
      const cancelledCustomer = (d as Draft & { cancel_customer?: CustomerDetails }).cancel_customer;
      await save({ state: "idle", data: cancelledCustomer ? { last_customer: cancelledCustomer } : {} });
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
      return confirmation(psid, `${imageNotice}🧾 အော်ဒါစာရင်း\n${draftItems(nd)}\nစုစုပေါင်း: ${fmt(draftTotal(nd))}\nငွေပေးချေမှု: ${paymentMethodLabel(selectedMethod)}\n${paymentMethodInstruction(selectedMethod)}\n\nအမည်: ${nd.name}\nဖုန်း: ${nd.phone}\nလိပ်စာ: ${nd.address}\n\nလိပ်စာမှန်ကန်ရင် YES ကိုနှိပ်ပါ။ ပြင်လိုရင် NO ကိုပို့ပါ။`);
    }
    case "confirm": {
      if (!isYes(msg)) return text(psid, "လိပ်စာမှန်ကန်ရင် “yes” လို့ ပြန်ပို့ပါ။ ပြင်လိုရင် “no” လို့ ပို့ပါ။");
      if (d.cart?.length) {
        const isPrepaidCart = d.payment_method === "prepaid";
        if (isPrepaidCart && !d.payment_proof_url) {
          const { data: bank } = await db.from("shop_settings")
            .select("bank_name,bank_account_name,bank_account_number")
            .eq("owner_id", owner)
            .maybeSingle();
          await save({ state: "awaiting_payment_proof", data: d });
          return text(psid, `ငွေလွှဲပြီးသားဖြတ်ပိုင်းကို အရင်ပို့ပေးပါရှင်။ ဖြတ်ပိုင်းရပြီးမှ အော်ဒါကို အတည်ပြုတင်ပေးပါမယ်။\n\nငွေလွှဲရန်ဘဏ်အချက်အလက်\nဘဏ်: ${bank?.bank_name ?? "Admin ထံ ဆက်သွယ်ပါ"}\nအကောင့်အမည်: ${bank?.bank_account_name ?? "မသတ်မှတ်ရသေးပါ"}\nအကောင့်နံပါတ်: ${bank?.bank_account_number ?? "မသတ်မှတ်ရသေးပါ"}\nပေးချေရန်ပမာဏ: ${fmt(draftTotal(d))}\n\nငွေလွှဲပြီးပါက ဖြတ်ပိုင်းဓာတ်ပုံကို ဒီ Messenger မှာ ပို့ပါရှင်။`);
        }
        const paymentMethod: CashPaymentMethod = "seller_delivery_cash";
        const cartItemsNote = `CART_ITEMS:${JSON.stringify(d.cart.map((item) => ({ product: item.product, qty: item.qty, unit: item.unit, price: item.price })))}`;
        const cartArgs = {
          _owner: owner,
          _psid: psid,
          _items: d.cart.map((item) => ({ product_id: item.product_id, qty: item.qty })),
          _name: String(d.name),
          _phone: String(d.phone),
          _township: "",
          _address: String(d.address),
          _note: cartItemsNote,
          _payment_method: isPrepaidCart ? "prepaid" : paymentMethod,
        };
        const result = await callShopRpc(db, "place_cart_orders_from_messenger", cartArgs);
        if (result.error) {
          console.error("Cart checkout RPC failed", { owner, psid: psid.slice(-6), message: result.error.message });
          await save({ state: "idle", data: { last_customer: { name: d.name, phone: d.phone, address: d.address } } });
          const outOfStockItem = d.cart.find((item) => result.error?.message.includes(item.product));
          const migrationMissing = /function .*place_cart_orders_from_messenger|does not exist|public_order_id|duplicate key/i.test(result.error.message);
          return text(psid, result.error.message.includes("OUT_OF_STOCK")
            ? `${outOfStockItem?.product ?? "ပစ္စည်း"} အတွက် လက်ကျန်မလုံလောက်တော့ပါရှင်။`
            : migrationMissing
              ? "Cart အော်ဒါတင်စနစ်ကို ပြင်ဆင်နေဆဲဖြစ်ပါသည်။ ခဏနေပြီး ထပ်စမ်းပါရှင်။"
            : "Cart အော်ဒါတင်ရာတွင် အမှားဖြစ်ပါသည်။ ခဏနေပြီး ထပ်စမ်းပါရှင်။");
        }
        const createdRows = (Array.isArray(result.data) ? result.data : result.data ? [result.data] : []) as Array<{ id?: string; public_order_id?: string; order_no?: number; product_id?: string | null; total?: number }>;
        const firstCreated = createdRows[0];
        const orderId = firstCreated?.public_order_id ?? String(firstCreated?.order_no ?? "").padStart(6, "0");
        for (const row of createdRows) {
          if (row.product_id) await retryLowStockAlerts(owner, row.product_id);
        }
        await save({ state: "idle", data: { last_customer: { name: d.name, phone: d.phone, address: d.address } } });
        const summary = `Order ID: ${orderId}\n${draftItems(d)}\nစုစုပေါင်း: ${fmt(draftTotal(d))}\n\nCart ထဲက ပစ္စည်းများကို အော်ဒါတင်ပြီးပါပြီရှင်။`;
        if (isPrepaidCart) {
          const proofUrl = String((d as Draft & { payment_proof_url?: string }).payment_proof_url ?? "");
          const rowIds = createdRows.map((row) => row.id).filter((id): id is string => Boolean(id));
          const now = new Date().toISOString();
          const { data: submittedProof, error: proofUpdateError } = await db.from("orders")
            .update({ payment_method: "prepaid", payment_status: "proof_submitted", payment_proof_url: proofUrl || null, payment_submitted_at: now })
            .eq("owner_id", owner).in("id", rowIds).neq("payment_status", "proof_submitted").select("id");
          if (proofUpdateError) console.error("Could not save prepaid cart payment proof", proofUpdateError.message);
          if (submittedProof?.length && shopCurrency?.low_stock_alert_psid && proofUrl) {
            const reviewMessage = formatPaymentProofReviewMessage({
              orderId,
              product: draftItems(d),
              total: draftTotal(d),
              currency: shopCurrency.currency,
              customerName: String(d.name ?? ""),
              phone: String(d.phone ?? ""),
              address: String(d.address ?? ""),
            });
            const delivery = await sendPaymentProofNotification(shopCurrency.low_stock_alert_psid, reviewMessage, proofUrl, orderId);
            if (!delivery.textSent || !delivery.receiptSent) console.error("Could not deliver prepaid cart review to the configured Messenger recipient", delivery.reason);
          }
        }
        const orderMessage = isPrepaidCart
          ? `Order ID: ${orderId}\nနာမည်၊ ဖုန်းနံပါတ်၊ လိပ်စာ ရရှိပါပြီရှင်။ ငွေလွှဲဖြတ်ပိုင်းနဲ့အတူ Admin စစ်ဆေးရန် ပို့ထားပါပြီ။ Admin က အတည်ပြုခလုတ်နှိပ်ပြီးမှ ဝယ်ယူမှုအောင်မြင်ပါမယ်ရှင်။\n\nအမည်: ${d.name}\nဖုန်း: ${d.phone}\nလိပ်စာ: ${d.address}\n\nမပို့ဆောင်မီ အော်ဒါကို ဖျက်နိုင်ပါသည်။`
          : `${summary}\nငွေပေးချေမှု: ${paymentMethodLabel(paymentMethod)}\n${paymentMethodInstruction(paymentMethod)}\nအမည်: ${d.name}\nဖုန်း: ${d.phone}\nလိပ်စာ: ${d.address}\n\nမပို့ဆောင်မီ အော်ဒါကို ပြင်နိုင်၊ ဖျက်နိုင်ပါသည်။`;
        return orderActions(psid, orderMessage, orderId, false);
      }
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

  // Gemini can temporarily return 429/503/524. Do not let a Burmese sentence
  // fall through as a fake product code while the AI layer is unavailable.
  const req = isDeterministicProductRequest(msg) ? parseProductRequest(msg) : null;
  if (!req) {
    const productContext = /(ပစ္စည်း|ဖိနပ်|ဖုန်း|အိတ်|အင်္ကျီ|နာရီ|iphone|product|code|လက်ကျန်|ဝယ်|မှာယူ|အော်ဒါ)/i.test(msg);
    const conversationalFallback = productContext && /ရှိလား|ရှိပါသလား|ရမလား|ရနိုင်လား/i.test(msg)
      ? "ပစ္စည်းအမည် ဒါမှမဟုတ် Product Code ကို ပို့ပေးပါရှင်။ အဲဒီပစ္စည်းရဲ့ ဈေးနှုန်းနဲ့ လက်ကျန်ကို ဒီနေရာမှာ တစ်ခါတည်း ပြပေးပါမယ်။"
      : productContext && /ဈေး|ဘယ်လောက်|တန်လဲ/i.test(msg)
        ? "ဘယ်ပစ္စည်းကို မေးတာလဲဆိုတာ Product Code ဒါမှမဟုတ် ပစ္စည်းအမည်နဲ့ ပို့ပေးပါရှင်။ ဈေးနှုန်းကို ဒီ Messenger မှာ တိုက်ရိုက်ပြပေးပါမယ်။"
        : /ပို့|အိမ်ရောက်|ပေးချေ|ငွေချေ/i.test(msg)
          ? "ပို့ဆောင်မှုနဲ့ ငွေပေးချေမှုကို ကူညီပေးနိုင်ပါတယ်ရှင်။ မှာယူလိုတဲ့ Product Code နဲ့ အရေအတွက်ကို ပို့ပေးပါ။ ဥပမာ ABC123=2"
          : "မေးထားတာကို အခုချိန်မှာ အလိုအလျောက်နားလည်မရသေးပါရှင်။ မေးချင်တဲ့အကြောင်းအရာကို တစ်ကြောင်းလောက် ပြန်ရေးပေးပါ။";
    webhookLog("Gemini fallback reply sent", {});
    return text(psid, conversationalFallback);
  }
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
    .eq("owner_id", owner).eq("psid", psid).order("created_at", { ascending: false }).limit(1).maybeSingle();
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
  if (!s || s.state !== "awaiting_payment_proof") return text(psid, "ငွေကြိုပေးချေရန်စောင့်နေသော အော်ဒါမရှိပါ။ အရင်ဆုံး ပစ္စည်း Code နှင့် အရေအတွက်ကို ပို့ပါရှင်။");
  const data: Record<string, unknown> = { ...(s.data as Record<string, unknown>), payment_proof_url: imageUrl };
  if (Array.isArray(data["cart"]) && data["name"] && data["phone"] && data["address"]) {
    await db.from("messenger_sessions").upsert({ ...s, state: "confirm", data: data as never, updated_at: new Date().toISOString() });
    return handleText(db, owner, psid, "YES", "");
  }
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

async function resumePendingCommentOrder(db: Admin, owner: string, psid: string) {
  const { data: sessions, error } = await db
    .from("messenger_sessions")
    .select("psid, data")
    .eq("owner_id", owner)
    .eq("state", "awaiting_messenger_reply")
    .limit(50);
  if (error) {
    console.error("Could not look up pending Facebook comment order");
    return null;
  }

  const pending = (sessions ?? []).find((row) => {
    const data = row.data as Record<string, unknown> | null;
    return data?.["commenter_id"] === psid && typeof data["pending_code"] === "string" && typeof data["pending_qty"] === "number";
  });
  if (!pending) return null;

  const data = pending.data as Record<string, unknown>;
  const code = String(data["pending_code"]);
  const quantity = Number(data["pending_qty"]);
  await db
    .from("messenger_sessions")
    .update({ state: "messenger_linked", updated_at: new Date().toISOString() })
    .eq("owner_id", owner)
    .eq("psid", pending.psid);
  webhookLog("comment order resumed in Messenger", { pendingCode: code, quantity });
  return `${code}=${quantity}`;
}

export const messengerHandlers = {
      GET: async ({ request }: { request: Request }) => {
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
      POST: async ({ request }: { request: Request }) => {
        const body = await request.text();
        const signature = request.headers.get("x-hub-signature-256");
        console.info("[shop-messenger] webhook POST received", { path: new URL(request.url).pathname, bodyBytes: body.length, hasSignature: Boolean(signature) });
        const appSecret = envFirst("SHOP_FB_APP_SECRET", "FB_APP_SECRET", "FACEBOOK_APP_SECRET", "META_APP_SECRET");
        const signatureFormatValid = Boolean(signature && /^sha256=[a-f0-9]{64}$/.test(signature));
        const signatureAccepted = await verifyMessengerSignature(body, signature, appSecret);
        if (!signatureAccepted) {
          console.warn("[shop-messenger] webhook signature rejected", { hasSignature: Boolean(signature), signatureFormatValid, hasAppSecret: Boolean(appSecret) });
          return new Response("Invalid signature", { status: 401 });
        }
        webhookLog("signature accepted");
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
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
            changes?: Array<{ field: string; value?: { item?: string; verb?: string; message?: string; comment_id?: string; post_id?: string; parent_id?: string; from?: { id?: string } } }>;
            messaging?: { sender: { id: string }; message?: { mid?: string; text?: string; is_echo?: boolean; quick_reply?: { payload?: string }; attachments?: Array<{ type?: string; payload?: { url?: string } }> }; postback?: { payload?: string } }[];
          }[];
        };
        webhookLog("payload parsed", { entries: payload.entry.length });
        if (payload.object !== "page") return new Response("ok");
        const origin = new URL(request.url).origin;
        for (const entry of payload.entry ?? []) {
          webhookLog("entry received", { pageId: maskFacebookId(entry.id), hasMessaging: Boolean(entry.messaging?.length) });
          if (entry.id === "0") {
            console.info("[shop-messenger] feed test notification received");
            continue;
          }
          const { data: configuredShops } = await supabaseAdmin.from("shop_settings").select("owner_id, fb_page_id, messenger_username, currency");
          const shop = configuredShops?.find((candidate) => String(candidate.fb_page_id ?? "").trim() === String(entry.id).trim());
          if (!shop) {
            console.warn("[shop-messenger] no shop configured for page entry", {
              receivedPageId: maskFacebookId(entry.id),
              configuredPageIds: (configuredShops ?? []).map((candidate) => maskFacebookId(String(candidate.fb_page_id ?? ""))).filter(Boolean),
            });
            continue;
          }
          webhookLog("received Page ID matched", { pageId: maskFacebookId(entry.id) });
          for (const change of entry.changes ?? []) {
            try {
              await handleProductComment(change as Parameters<typeof handleProductComment>[0], entry.id, {
                findActiveProduct: async (code) => {
                  const { data, error } = await supabaseAdmin.from("products").select("name, price, unit").eq("owner_id", shop.owner_id).eq("code", code).eq("active", true).maybeSingle();
                  if (error) throw new Error("product_lookup_failed");
                  if (!data) return null;
                  const request = parseProductRequest(change.value?.message ?? "");
                  const quantity = request?.qty ?? 0;
                  return {
                    name: String(data.name),
                    price: Number(data.price),
                    unit: String(data.unit ?? "ခု"),
                    priceText: formatCurrency(Number(data.price), shop.currency),
                    totalText: formatCurrency(Number(data.price) * quantity, shop.currency),
                  };
                },
                claim: async (commentId) => {
                  const { error } = await supabaseAdmin.from("messenger_sessions").insert({ owner_id: shop.owner_id, psid: `comment:${commentId}`, state: "comment_claimed", data: {} });
                  if (error?.code === "23505") return false;
                  if (error) throw new Error("comment_claim_failed");
                  return true;
                },
                privateReply: (commentId, message) => sendCommentPrivateReply(entry.id, commentId, message),
                complete: async (commentId, status, pending) => {
                  const { error } = await supabaseAdmin.from("messenger_sessions").update({
                    state: status,
                    data: status === "awaiting_messenger_reply" ? {
                      commenter_id: pending.commenterId,
                      pending_code: pending.code,
                      pending_qty: pending.qty,
                    } : {},
                    updated_at: new Date().toISOString(),
                  }).eq("owner_id", shop.owner_id).eq("psid", `comment:${commentId}`);
                  if (error) throw new Error("comment_receipt_failed");
                },
              });
            } catch {
              webhookLog("comment processing failed");
              return new Response("Temporary processing error", { status: 500 });
            }
          }
          for (const ev of entry.messaging ?? []) {
            const message = ev.message as unknown as { mid?: string; is_echo?: boolean; text?: string; quick_reply?: { payload?: string }; attachments?: Array<{ type?: string; payload?: { url?: string } }> } | undefined;
            if (message?.mid && !(await claimMessengerEvent(supabaseAdmin, shop.owner_id, message.mid))) continue;
            const t = message?.is_echo ? undefined : (message?.quick_reply?.payload ?? message?.text ?? ev.postback?.payload);
            const imageUrl = message?.attachments?.find((a) => a.type === "image")?.payload?.url;
            if (imageUrl) {
              try {
                const customerDetailsImageHandled = await handleCustomerDetailsImage(supabaseAdmin, shop.owner_id, ev.sender.id, imageUrl, origin, shop.messenger_username);
                if (!customerDetailsImageHandled) await handlePaymentProof(supabaseAdmin, shop.owner_id, ev.sender.id, imageUrl);
              } catch (error) {
                webhookLog("image handler failed");
                await text(ev.sender.id, "ပုံကို လုပ်ဆောင်မရပါ။ နာမည်၊ ဖုန်းနံပါတ်နဲ့ လိပ်စာကို စာသားဖြင့် ပို့ပါရှင်။");
              }
              continue;
            }
            if (!t) continue;
            try {
              webhookLog("handleText started");
              const resumedCode = await resumePendingCommentOrder(supabaseAdmin, shop.owner_id, ev.sender.id);
              await handleText(supabaseAdmin, shop.owner_id, ev.sender.id, (resumedCode ?? t).slice(0, 1000), origin, shop.messenger_username);
              webhookLog("handleText completed");
            } catch (e) {
              webhookLog("handleText failed");
              return new Response("Temporary processing error", { status: 500 });
            }
          }
        }
        return new Response("ok");
      },
};

export const Route = createFileRoute("/api/public/shop-messenger")({ server: { handlers: messengerHandlers } });
