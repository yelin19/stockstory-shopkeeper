import { createFileRoute } from "@tanstack/react-router";
import { parseProductRequest, isYes, isNo } from "@/lib/messenger-parse";

// Shop Messenger webhook. Secrets (server-only): SHOP_FB_APP_SECRET, SHOP_FB_VERIFY_TOKEN, SHOP_FB_PAGE_ACCESS_TOKEN.
// The FB_* aliases are also accepted so existing Lovable secrets continue to work.

const envFirst = (...names: string[]) => names.map((name) => process.env[name]).find(Boolean);

type Admin = Awaited<typeof import("@/integrations/supabase/client.server")>["supabaseAdmin"];
type Session = { owner_id: string; psid: string; pin_verified: boolean; state: string; data: Record<string, unknown> };
const callShopRpc = (db: Admin, name: string, args: Record<string, unknown>) =>
  (db.rpc as unknown as (fn: string, params: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>)(name, args);

async function verifySignature(body: string, header: string | null) {
  const secret = envFirst("SHOP_FB_APP_SECRET", "FB_APP_SECRET");
  if (!secret || !header?.startsWith("sha256=")) return false;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body)));
  const hex = [...sig].map((b) => b.toString(16).padStart(2, "0")).join("");
  const given = header.slice(7);
  if (given.length !== hex.length) return false;
  let diff = 0;
  for (let i = 0; i < hex.length; i++) diff |= hex.charCodeAt(i) ^ given.charCodeAt(i);
  return diff === 0;
}

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
const confirmation = (psid: string, t: string) => send(psid, {
  text: t,
  quick_replies: [
    { content_type: "text", title: "YES", payload: "YES" },
    { content_type: "text", title: "NO", payload: "NO" },
  ],
});
const fmt = (n: number) => Number(n).toLocaleString("en-US") + " Ks";
const paymentChoices = (psid: string, t: string) => send(psid, {
  text: t,
  quick_replies: [
    { content_type: "text", title: "ငွေကြိုလွှဲပါမည်", payload: "PREPAY" },
    { content_type: "text", title: "မဝယ်တော့ပါ", payload: "NO_BUY" },
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

async function handleText(db: Admin, owner: string, psid: string, msg: string, origin: string, pageUsername?: string | null) {
  const { data: existing } = await db.from("messenger_sessions").select("*").eq("owner_id", owner).eq("psid", psid).maybeSingle();
  const s: Session = (existing as Session | null) ?? { owner_id: owner, psid, pin_verified: false, state: "idle", data: {} };
  const save = (patch: Partial<Session>) =>
    db.from("messenger_sessions").upsert({ ...s, ...patch, data: (patch.data ?? s.data) as never, updated_at: new Date().toISOString() });

  const { data: returnedOrders } = await db.from("orders")
    .select("public_order_id, product_name, quantity, created_at")
    .eq("owner_id", owner)
    .eq("psid", psid)
    .eq("delivery_status", "returned")
    .order("created_at", { ascending: false })
    .limit(20);
  if (returnedOrders?.length) {
    const history = returnedOrders.map((o: { public_order_id: string; product_name: string; quantity: number; created_at: string }) =>
      `Order ID: ${o.public_order_id}\nရက်စွဲ: ${new Date(o.created_at).toLocaleDateString("en-GB")}\nပစ္စည်းအမည်: ${o.product_name}\nအရေအတွက်: ${o.quantity}ထုပ်`,
    ).join("\n\n");
    const data = s.data as Record<string, unknown>;
    if (msg.trim() === "PREPAY" || msg.trim() === "ငွေကြိုလွှဲပါမည်") {
      const pendingCode = typeof data.pending_code === "string" ? data.pending_code : "";
      const pendingQty = typeof data.pending_qty === "number" ? data.pending_qty : null;
      if (pendingCode && pendingQty) {
        const { data: p } = await db.from("products").select("*").eq("owner_id", owner).eq("code", pendingCode).eq("active", true).maybeSingle();
        if (!p) return text(psid, `Code ${pendingCode} ဖြင့် ပစ္စည်းမတွေ့ပါ။`);
        if (p.stock < pendingQty) return text(psid, p.stock ? `${p.name} အတွက် လက်ကျန် ${p.stock} ခုသာ ရှိပါသည်။` : `${p.name} လက်ကျန်ကုန်ပါပြီ။`);
        const { data: shop } = await db.from("shop_settings").select("bank_name, bank_account_name, bank_account_number").eq("owner_id", owner).maybeSingle();
        await save({ state: "awaiting_payment_proof", data: { product_id: p.id, code: p.code, product: p.name, price: Number(p.price), qty: pendingQty, prepay_allowed: true } });
        return text(psid, `🛒 ပစ္စည်းအမည်: ${p.name}\n🔢 အရေအတွက်: ${pendingQty}ထုပ်\n💰 တစ်ထုပ်ဈေး: ${fmt(Number(p.price))}\n💵 ပေးချေရန်ပမာဏ: ${fmt(Number(p.price) * pendingQty)}\n\nငွေလွှဲရန်ဘဏ်အချက်အလက်\nဘဏ်: ${shop?.bank_name ?? "Admin ထံ ဆက်သွယ်ပါ"}\nအကောင့်အမည်: ${shop?.bank_account_name ?? "မသတ်မှတ်ရသေးပါ"}\nအကောင့်နံပါတ်: ${shop?.bank_account_number ?? "မသတ်မှတ်ရသေးပါ"}\n\nငွေလွှဲပြီးပါက ဖြတ်ပိုင်းဓာတ်ပုံကို ဒီ Messenger မှာ ပို့ပါရှင်။ ဖြတ်ပိုင်းရပြီးမှ နာမည်၊ ဖုန်းနံပါတ်၊ လိပ်စာကို ဆက်တောင်းပါမယ်ရှင်။`);
      }
      await save({ state: "idle", data: { prepay_allowed: true } });
      return text(psid, "ကြိုတင်ငွေလွှဲစနစ်ကို ရွေးချယ်ပြီးပါပြီ။ ပစ္စည်း Code နှင့် အရေအတွက်ကို ပို့ပါ။ ဥပမာ 111=2");
    }
    if (msg.trim() === "NO_BUY" || msg.trim() === "မဝယ်တော့ပါ") {
      await save({ state: "idle", data: {} });
      return text(psid, "ဟုတ်ကဲ့ပါရှင်။ အော်ဒါအသစ် မတင်တော့ပါ။");
    }
    if (!data.prepay_allowed) {
      const pending = parseProductRequest(msg);
      const nextData = pending?.qty ? { pending_code: pending.code, pending_qty: pending.qty } : {};
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
      await save({ state: "cancel_order", data: { public_order_id: publicOrderId, product: order.product_name, quantity: order.quantity } });
      return confirmation(psid, `Order ID: ${publicOrderId}\nပစ္စည်းအမည်: ${order.product_name}\nအရေအတွက်: ${order.quantity}ထုပ်\n\nဒီအော်ဒါကို ဖျက်မည်မှာ သေချာပါသလား။`);
    }
    await save({ state: "edit_order", data: { public_order_id: publicOrderId, product: order.product_name, quantity: order.quantity } });
    return text(psid, `Order ID: ${publicOrderId}\nပစ္စည်းအမည်: ${order.product_name}\nလက်ရှိအရေအတွက်: ${order.quantity}ထုပ်\n\nအသစ်ပြောင်းလိုသော အရေအတွက်ကို ဂဏန်းတစ်ခုတည်းဖြင့် ပို့ပါ။ ဥပမာ 5`);
  }

  if (isNo(msg) && s.state !== "idle") {
    if (s.state === "cancel_order") {
      await save({ state: "idle", data: {} });
      return text(psid, "အော်ဒါဖျက်ခြင်းကို မလုပ်တော့ပါ။");
    }
    await save({ state: "idle", data: {} });
    return text(psid, "❌ အော်ဒါကို ပယ်ဖျက်လိုက်ပါပြီ။ ပစ္စည်း Code နှင့် အရေအတွက်ကို ထပ်ပို့နိုင်ပါတယ်။");
  }


  type Draft = { product_id?: string; code?: string; product?: string; price?: number; qty?: number; name?: string; phone?: string; address?: string; note?: string };
  const d = s.data as Draft;
  const next = async (state: string, data: Record<string, unknown>, prompt: string) => {
    await save({ state, data });
    return text(psid, prompt);
  };

  switch (s.state) {
    case "edit_order": {
      const quantity = Number(msg.trim());
      if (!/^[1-9][0-9]{0,3}$/.test(msg.trim())) return text(psid, "အရေအတွက်ကို 1 မှ 9999 အတွင်း ဂဏန်းဖြင့်သာ ပို့ပါ။");
      const { data: updated, error } = await callShopRpc(db, "edit_order_by_customer", {
        _owner: owner, _psid: psid, _public_order_id: String((d as { public_order_id?: string }).public_order_id), _qty: quantity,
      });
      await save({ state: "idle", data: {} });
      if (error) return text(psid, error.message.includes("OUT_OF_STOCK") ? "😔 လက်ကျန်မလုံလောက်တော့ပါ။ အရေအတွက်လျှော့ပြီး ထပ်စမ်းပါ။" : "အော်ဒါအရေအတွက်ပြင်ရာတွင် အမှားဖြစ်ပါသည်။");
      const o = updated as unknown as { public_order_id: string; product_name: string; quantity: number };
      return text(psid, `Order ID: ${o.public_order_id}\nပစ္စည်းအမည်: ${o.product_name}\nအရေအတွက်: ${o.quantity}ထုပ်\n\nအော်ဒါအရေအတွက်ကို ပြင်ဆင်ပြီးပါပြီ။`);
    }
    case "cancel_order": {
      if (!isYes(msg)) return text(psid, "အော်ဒါဖျက်ရန် YES ကိုနှိပ်ပါ။ မဖျက်လိုပါက NO ကိုနှိပ်ပါ။");
      const { error } = await callShopRpc(db, "cancel_order_by_customer", {
        _owner: owner, _psid: psid, _public_order_id: String((d as { public_order_id?: string }).public_order_id),
      });
      await save({ state: "idle", data: {} });
      if (error) return text(psid, "အော်ဒါဖျက်ရာတွင် အမှားဖြစ်ပါသည်။ ပို့ဆောင်ပြီးသားဖြစ်နိုင်ပါသည်။");
      return text(psid, `Order ID: ${String((d as { public_order_id?: string }).public_order_id)} ကို ဖျက်ပြီးပါပြီ။\nStock ကို အလိုအလျောက် ပြန်ဖြည့်ပြီးပါပြီ။`);
    }
    case "ask_customer_details": {
      const details = parseCustomerDetails(msg);
      if (!details) return text(psid, "အမည်၊ ဖုန်းနံပါတ်၊ လိပ်စာကို တစ်ခါတည်း ဒီပုံစံနဲ့ ပြန်ပို့ပါ။\nအမည်: မောင်မောင်\nဖုန်း: 09xxxxxxxxx\nလိပ်စာ: အိမ်အမှတ်၊ လမ်း၊ မြို့နယ်");
      const nd: Draft = { ...d, ...details, note: "" };
      await save({ state: "confirm", data: nd });
      return confirmation(psid, `🧾 အော်ဒါစာရင်း\n${nd.product}=${nd.qty}ထုပ်\nအမည်: ${nd.name}\nဖုန်း: ${nd.phone}\nလိပ်စာ: ${nd.address}\n\nလိပ်စာမှန်ကန်ရင် YES ကိုနှိပ်ပါ။ ပြင်လိုရင် NO ကိုနှိပ်ပါ။`);
    }
    case "confirm": {
      if (!isYes(msg)) return text(psid, "လိပ်စာမှန်ကန်ရင် “yes” လို့ ပြန်ပို့ပါ။ ပြင်လိုရင် “no” လို့ ပို့ပါ။");
      const { data: order, error } = await db.rpc("place_order", {
        _owner: owner, _psid: psid, _product_id: String(d.product_id), _qty: Number(d.qty),
        _name: String(d.name), _phone: String(d.phone), _township: "", _address: String(d.address), _note: String(d.note ?? ""),
      });
      await save({ state: "idle", data: {} });
      if (error) return text(psid, error.message.includes("OUT_OF_STOCK") ? "😔 လက်ကျန်မလုံလောက်တော့ပါ။ အရေအတွက်လျှော့ပြီး ထပ်စမ်းပါ။" : "အော်ဒါတင်ရာတွင် အမှားဖြစ်ပါသည်။ ခဏနေပြီး ထပ်စမ်းပါ။");
      const o = order as unknown as { public_order_id?: string; order_no: number; total: number };
      const orderId = o.public_order_id ?? String(o.order_no).padStart(6, "0");
      if ((d as Draft & { prepay_allowed?: boolean }).prepay_allowed) {
        const proofUrl = String((d as Draft & { payment_proof_url?: string }).payment_proof_url ?? "");
        await db.from("orders").update({ payment_method: "prepaid", payment_status: "proof_submitted", payment_proof_url: proofUrl || null, payment_submitted_at: new Date().toISOString() }).eq("owner_id", owner).eq("public_order_id", orderId).eq("psid", psid);
        return text(psid, `Order ID: ${orderId}\nနာမည်၊ ဖုန်းနံပါတ်၊ လိပ်စာ ရရှိပါပြီရှင်။ ငွေလွှဲဖြတ်ပိုင်းနဲ့အတူ Admin စစ်ဆေးရန် ပို့ထားပါပြီ။ Admin က အတည်ပြုခလုတ်နှိပ်ပြီးမှ ဝယ်ယူမှုအောင်မြင်ပါမယ်ရှင်။`);
      }
      await text(psid, `Order ID: ${orderId}\nပစ္စည်းအမည်: ${d.product}\nအရေအတွက်: ${d.qty}ထုပ်\nအမည်: ${d.name}\nဖုန်း: ${d.phone}\nလိပ်စာ: ${d.address}\n\nမပို့ဆောင်မီ ပြင်လိုပါက — ပြင် ${orderId}\nအော်ဒါဖျက်လိုပါက — ဖျက် ${orderId}`);
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

  if (req.qty === null) {
    if (p.image_url) await send(psid, { attachment: { type: "image", payload: { url: `${origin}/api/public/product-image/${encodeURIComponent(p.code)}`, is_reusable: true } } });
    return text(psid, `${p.name}\n💰 ${fmt(Number(p.price))}\n📦 ${p.stock > 0 ? `လက်ကျန် ${p.stock}` : "လက်ကျန်ကုန်ပါပြီ"}${p.description ? `\n\n${p.description}` : ""}\n\nအော်ဒါတင်ရန် ${p.code} 1 သို့မဟုတ် ${p.code}=2 ပို့ပါ။`);
  }
  if (p.stock < req.qty) return text(psid, p.stock ? `${p.name} အတွက် လက်ကျန် ${p.stock} ခုသာ ရှိပါသည်။` : `${p.name} လက်ကျန်ကုန်ပါပြီ။`);
  if (p.image_url) await send(psid, { attachment: { type: "image", payload: { url: `${origin}/api/public/product-image/${encodeURIComponent(p.code)}`, is_reusable: true } } });
  if ((s.data as Record<string, unknown>).prepay_allowed) {
    const { data: shop } = await db.from("shop_settings").select("bank_name, bank_account_name, bank_account_number").eq("owner_id", owner).maybeSingle();
    return next("awaiting_payment_proof", { product_id: p.id, code: p.code, product: p.name, price: Number(p.price), qty: req.qty, prepay_allowed: true },
      `🛒 ${p.name}\nအရေအတွက်: ${req.qty}ထုပ်\nပေးချေရန်ပမာဏ: ${fmt(Number(p.price) * req.qty)}\n\nငွေလွှဲရန်ဘဏ်အချက်အလက်\nဘဏ်: ${shop?.bank_name ?? "Admin ထံ ဆက်သွယ်ပါ"}\nအကောင့်အမည်: ${shop?.bank_account_name ?? "မသတ်မှတ်ရသေးပါ"}\nအကောင့်နံပါတ်: ${shop?.bank_account_number ?? "မသတ်မှတ်ရသေးပါ"}\n\nငွေလွှဲပြီးပါက ဖြတ်ပိုင်းဓာတ်ပုံကို ဒီ Messenger မှာ ပို့ပါရှင်။ ဖြတ်ပိုင်းရပြီးမှ နာမည်၊ ဖုန်းနံပါတ်၊ လိပ်စာကို ဆက်တောင်းပါမယ်ရှင်။`);
  }
  return next("ask_customer_details", { product_id: p.id, code: p.code, product: p.name, price: Number(p.price), qty: req.qty, prepay_allowed: false },
    `🛒 ${p.name}\n💰 တစ်ခုဈေး: ${fmt(Number(p.price))}\n📦 မှာယူမည့်အရေအတွက်: ${req.qty}\n💵 စုစုပေါင်း: ${fmt(Number(p.price) * req.qty)}\n\nဝယ်သူအမည်၊ ဖုန်းနံပါတ်၊ ပို့ရမည့်လိပ်စာကို တစ်ခါတည်း ဒီပုံစံနဲ့ ပို့ပါ။\nအမည်: မောင်မောင်\nဖုန်း: 09xxxxxxxxx\nလိပ်စာ: အိမ်အမှတ်၊ လမ်း၊ မြို့နယ်`);
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
        if (expected && u.searchParams.get("hub.mode") === "subscribe" && u.searchParams.get("hub.verify_token") === expected) {
          return new Response(u.searchParams.get("hub.challenge") ?? "", { status: 200 });
        }
        return new Response("Forbidden", { status: 403 });
      },
      POST: async ({ request }) => {
        const body = await request.text();
        if (!(await verifySignature(body, request.headers.get("x-hub-signature-256")))) return new Response("Invalid signature", { status: 401 });
        const payload = JSON.parse(body) as { object?: string; entry?: { id: string; messaging?: { sender: { id: string }; message?: { text?: string; is_echo?: boolean; quick_reply?: { payload?: string } }; postback?: { payload?: string } }[] }[] };
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
            }
          }
        }
        return new Response("ok");
      },
    },
  },
});
