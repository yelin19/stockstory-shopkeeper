import { createFileRoute } from "@tanstack/react-router";
import { parseProductRequest, isYes, isNo } from "@/lib/messenger-parse";

// Shop Messenger webhook. Secrets (server-only): SHOP_FB_APP_SECRET, SHOP_FB_VERIFY_TOKEN, SHOP_FB_PAGE_ACCESS_TOKEN.
// The FB_* aliases are also accepted so existing Lovable secrets continue to work.

const envFirst = (...names: string[]) => names.map((name) => process.env[name]).find(Boolean);

type Admin = Awaited<typeof import("@/integrations/supabase/client.server")>["supabaseAdmin"];
type Session = { owner_id: string; psid: string; pin_verified: boolean; state: string; data: Record<string, unknown> };

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

  if (isNo(msg) && s.state !== "idle") {
    await save({ state: "idle", data: {} });
    return text(psid, "❌ အော်ဒါကို ပယ်ဖျက်လိုက်ပါပြီ။ ပစ္စည်း Code နှင့် အရေအတွက်ကို ထပ်ပို့နိုင်ပါတယ်။");
  }


  type Draft = { product_id?: string; code?: string; product?: string; price?: number; qty?: number; name?: string; phone?: string; township?: string; address?: string; note?: string };
  const d = s.data as Draft;
  const next = async (state: string, data: Record<string, unknown>, prompt: string) => {
    await save({ state, data });
    return text(psid, prompt);
  };

  switch (s.state) {
    case "ask_customer_details": {
      const details = parseCustomerDetails(msg);
      if (!details) return text(psid, "အမည်၊ ဖုန်းနံပါတ်၊ လိပ်စာကို တစ်ခါတည်း ဒီပုံစံနဲ့ ပြန်ပို့ပါ။\nအမည်: မောင်မောင်\nဖုန်း: 09xxxxxxxxx\nလိပ်စာ: အိမ်အမှတ်၊ လမ်း၊ မြို့နယ်");
      const nd: Draft = { ...d, ...details, township: "လိပ်စာထဲတွင်ပါဝင်သည်", note: "" };
      await save({ state: "confirm", data: nd });
      return confirmation(psid, `🧾 အော်ဒါစာရင်း\n${nd.product}=${nd.qty}ထုပ်\nအမည်: ${nd.name}\nဖုန်း: ${nd.phone}\nလိပ်စာ: ${nd.address}\n\nလိပ်စာမှန်ကန်ရင် YES ကိုနှိပ်ပါ။ ပြင်လိုရင် NO ကိုနှိပ်ပါ။`);
    }
    case "confirm": {
      if (!isYes(msg)) return text(psid, "လိပ်စာမှန်ကန်ရင် “yes” လို့ ပြန်ပို့ပါ။ ပြင်လိုရင် “no” လို့ ပို့ပါ။");
      const { data: order, error } = await db.rpc("place_order", {
        _owner: owner, _psid: psid, _product_id: String(d.product_id), _qty: Number(d.qty),
        _name: String(d.name), _phone: String(d.phone), _township: String(d.township), _address: String(d.address), _note: String(d.note ?? ""),
      });
      await save({ state: "idle", data: {} });
      if (error) return text(psid, error.message.includes("OUT_OF_STOCK") ? "😔 လက်ကျန်မလုံလောက်တော့ပါ။ အရေအတွက်လျှော့ပြီး ထပ်စမ်းပါ။" : "အော်ဒါတင်ရာတွင် အမှားဖြစ်ပါသည်။ ခဏနေပြီး ထပ်စမ်းပါ။");
      const o = order as unknown as { public_order_id?: string; order_no: number; total: number };
      const orderId = o.public_order_id ?? String(o.order_no).padStart(6, "0");
      await text(psid, `Order ID: ${orderId}\nအမည်: ${d.name}\nဖုန်း: ${d.phone}\nလိပ်စာ: ${d.address}`);
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
  return next("ask_customer_details", { product_id: p.id, code: p.code, product: p.name, price: Number(p.price), qty: req.qty },
    `🛒 ${p.name}\n💰 တစ်ခုဈေး: ${fmt(Number(p.price))}\n📦 မှာယူမည့်အရေအတွက်: ${req.qty}\n💵 စုစုပေါင်း: ${fmt(Number(p.price) * req.qty)}\n\nဝယ်သူအမည်၊ ဖုန်းနံပါတ်၊ ပို့ရမည့်လိပ်စာကို တစ်ခါတည်း ဒီပုံစံနဲ့ ပို့ပါ။\nအမည်: မောင်မောင်\nဖုန်း: 09xxxxxxxxx\nလိပ်စာ: အိမ်အမှတ်၊ လမ်း၊ မြို့နယ်`);
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
            const t = ev.message?.is_echo ? undefined : (ev.message?.text ?? ev.message?.quick_reply?.payload ?? ev.postback?.payload);
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
