import { parseProductRequest, isYes, isNo } from "@/lib/messenger-parse";
import { messengerPayloadSchema, messengerVerificationSchema, verifyMessengerSignature } from "@/lib/messenger-webhook";
import { formatCurrency } from "@/lib/currency";
import { formatQuantity, normalizeProductUnit } from "@/lib/product-unit";

// Shop Messenger webhook. Secrets (server-only): SHOP_FB_APP_SECRET, SHOP_FB_VERIFY_TOKEN, SHOP_FB_PAGE_ACCESS_TOKEN.

type Admin = Awaited<typeof import("@/integrations/supabase/client.server")>["supabaseAdmin"];
type Session = { owner_id: string; psid: string; pin_verified: boolean; state: string; data: Record<string, unknown> };

async function send(psid: string, message: Record<string, unknown>) {
  const token = process.env["SHOP_FB_PAGE_ACCESS_TOKEN"];
  if (!token) return;
  const res = await fetch(`https://graph.facebook.com/v21.0/me/messages?access_token=${encodeURIComponent(token)}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ recipient: { id: psid }, messaging_type: "RESPONSE", message }),
  });
  if (!res.ok) console.error("Messenger send failed", res.status);
}
const text = (psid: string, t: string) => send(psid, { text: t });

async function handleText(db: Admin, owner: string, psid: string, msg: string, origin: string) {
  const { data: existing } = await db.from("messenger_sessions").select("*").eq("owner_id", owner).eq("psid", psid).maybeSingle();
  const s: Session = (existing as Session | null) ?? { owner_id: owner, psid, pin_verified: false, state: "idle", data: {} };
  const { data: shopCurrency } = await db.from("shop_settings").select("currency").eq("owner_id", owner).maybeSingle();
  const fmt = (amount: number) => formatCurrency(amount, shopCurrency?.currency);
  const save = (patch: Partial<Session>) =>
    db.from("messenger_sessions").upsert({ ...s, ...patch, data: (patch.data ?? s.data) as never, updated_at: new Date().toISOString() });

  if (!s.pin_verified) {
    const { data: ok } = await db.rpc("verify_shop_pin", { _owner: owner, _pin: msg.trim() });
    if (ok) {
      await save({ pin_verified: true, state: "idle", data: {} });
      return text(psid, "✅ PIN accepted. Send a product code (e.g. 111) to see it, or 111 2 to order 2 units.");
    }
    if (!existing) await save({});
    return text(psid, "🔒 Please enter the Shop PIN to continue.");
  }

  if (isNo(msg) && s.state !== "idle") {
    await save({ state: "idle", data: {} });
    return text(psid, "Order cancelled. Send a product code any time.");
  }

  type Draft = { product_id?: string; code?: string; product?: string; unit?: string; price?: number; qty?: number; name?: string; phone?: string; township?: string; address?: string; note?: string };
  const d = s.data as Draft;
  const next = async (state: string, data: Record<string, unknown>, prompt: string) => {
    await save({ state, data });
    return text(psid, prompt);
  };

  switch (s.state) {
    case "ask_name":
      return next("ask_phone", { ...d, name: msg.trim().slice(0, 100) }, "📞 Phone number?");
    case "ask_phone":
      if (!/^[0-9+\-\s]{6,20}$/.test(msg.trim())) return text(psid, "Please send a valid phone number.");
      return next("ask_township", { ...d, phone: msg.trim() }, "🏙️ City / Township?");
    case "ask_township":
      return next("ask_address", { ...d, township: msg.trim().slice(0, 100) }, "🏠 Full delivery address?");
    case "ask_address":
      return next("ask_note", { ...d, address: msg.trim().slice(0, 500) }, "📝 Any note? (send - to skip)");
    case "ask_note": {
      const nd: Draft = { ...d, note: msg.trim() === "-" ? "" : msg.trim().slice(0, 300) };
      const total = Number(nd.price) * Number(nd.qty);
      return next(
        "confirm",
        nd,
        `🧾 Order summary\n${nd.code} · ${nd.product}\nQty: ${formatQuantity(nd.qty ?? 0, nd.unit)} × ${fmt(Number(nd.price))} = ${fmt(total)}\n\nName: ${nd.name}\nPhone: ${nd.phone}\nTownship: ${nd.township}\nAddress: ${nd.address}${nd.note ? `\nNote: ${nd.note}` : ""}\n\nReply YES to confirm or NO to cancel.`,
      );
    }
    case "confirm": {
      if (!isYes(msg)) return text(psid, "Reply YES to confirm or NO to cancel.");
      const { data: order, error } = await db.rpc("place_order", {
        _owner: owner, _psid: psid, _product_id: String(d.product_id), _qty: Number(d.qty),
        _name: String(d.name), _phone: String(d.phone), _township: String(d.township), _address: String(d.address), _note: String(d.note ?? ""),
      });
      await save({ state: "idle", data: {} });
      if (error) return text(psid, error.message.includes("OUT_OF_STOCK") ? "😔 Sorry, not enough stock left. Please try a smaller quantity." : "Sorry, something went wrong. Please try again.");
      const o = order as unknown as { public_order_id?: string; order_no: number; total: number };
      const orderId = o.public_order_id ?? String(o.order_no).padStart(6, "0");
      return text(psid, `🎉 အော်ဒါအတည်ပြုပြီးပါပြီ။\n🆔 ဝယ်ယူမှု ID: ${orderId}\n💵 စုစုပေါင်း: ${fmt(o.total)}\nမကြာမီ ပို့ဆောင်ပေးပါမယ်။ ကျေးဇူးတင်ပါတယ်။`);
    }
  }

  const req = parseProductRequest(msg);
  if (!req) return text(psid, "Send a product code (e.g. 111) or code and quantity (e.g. 111 2).");
  const { data: p } = await db.from("products").select("*").eq("owner_id", owner).eq("code", req.code).eq("active", true).maybeSingle();
  if (!p) return text(psid, `No product found with code ${req.code}.`);

  if (req.qty === null) {
    if (p.image_url) await send(psid, { attachment: { type: "image", payload: { url: `${origin}/api/public/product-image/${encodeURIComponent(p.code)}`, is_reusable: true } } });
    return text(psid, `${p.name}\n💰 ${fmt(Number(p.price))} / 1${normalizeProductUnit(p.unit)}\n📦 ${p.stock > 0 ? `${formatQuantity(p.stock, p.unit)} in stock` : "Out of stock"}${p.description ? `\n\n${p.description}` : ""}\n\nTo order send: ${p.code} 1  (or ${p.code}=2)`);
  }
  if (p.stock < req.qty) return text(psid, p.stock ? `Only ${formatQuantity(p.stock, p.unit)} left for ${p.name}.` : `${p.name} is out of stock.`);
  return next("ask_name", { product_id: p.id, code: p.code, product: p.name, unit: p.unit, price: Number(p.price), qty: req.qty },
    `🛒 ${formatQuantity(req.qty, p.unit)} × ${p.name} (${fmt(Number(p.price) * req.qty)})\n\n👤 Your name?  (send NO anytime to cancel)`);
}

export const messengerHandlers = {
      GET: async ({ request }: { request: Request }) => {
        const u = new URL(request.url);
        const expected = process.env["SHOP_FB_VERIFY_TOKEN"] ?? process.env["MESSENGER_VERIFY_TOKEN"];
        const parsed = messengerVerificationSchema.safeParse({ mode: u.searchParams.get("hub.mode"), token: u.searchParams.get("hub.verify_token"), challenge: u.searchParams.get("hub.challenge") });
        if (expected && parsed.success && parsed.data.token === expected) {
          return new Response(parsed.data.challenge, { status: 200 });
        }
        return new Response("Forbidden", { status: 403 });
      },
      POST: async ({ request }: { request: Request }) => {
        const body = await request.text();
        if (!(await verifyMessengerSignature(body, request.headers.get("x-hub-signature-256"), process.env["SHOP_FB_APP_SECRET"]))) return new Response("Invalid signature", { status: 401 });
        let json: unknown;
        try { json = JSON.parse(body); } catch { return new Response("Invalid JSON", { status: 400 }); }
        const parsed = messengerPayloadSchema.safeParse(json);
        if (!parsed.success) return new Response("Invalid Messenger payload", { status: 400 });
        const payload = parsed.data;
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const origin = new URL(request.url).origin;
        for (const entry of payload.entry ?? []) {
          const { data: shop } = await supabaseAdmin.from("shop_settings").select("owner_id").eq("fb_page_id", entry.id).maybeSingle();
          if (!shop) continue;
          for (const ev of entry.messaging ?? []) {
            const t = ev.message?.is_echo ? undefined : (ev.message?.text ?? ev.postback?.payload);
            if (!t) continue;
            try {
              await handleText(supabaseAdmin, shop.owner_id, ev.sender.id, t.slice(0, 1000), origin);
            } catch {
              console.error("shop-messenger handler failed");
              return new Response("Processing failed", { status: 500 });
            }
          }
        }
        return new Response("ok");
      },
};
