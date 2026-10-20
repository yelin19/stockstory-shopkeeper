import { createFileRoute } from "@tanstack/react-router";
import { parseProductRequest, isYes, isNo } from "@/lib/messenger-parse";

// Shop Messenger webhook. Secrets (server-only): SHOP_FB_APP_SECRET, SHOP_FB_VERIFY_TOKEN, SHOP_FB_PAGE_ACCESS_TOKEN.

type Admin = Awaited<typeof import("@/integrations/supabase/client.server")>["supabaseAdmin"];
type Session = { owner_id: string; psid: string; pin_verified: boolean; state: string; data: Record<string, unknown> };

async function verifySignature(body: string, header: string | null) {
  const secret = process.env["SHOP_FB_APP_SECRET"];
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
const fmt = (n: number) => Number(n).toLocaleString("en-US") + " Ks";

async function handleText(db: Admin, owner: string, psid: string, msg: string, origin: string) {
  const { data: existing } = await db.from("messenger_sessions").select("*").eq("owner_id", owner).eq("psid", psid).maybeSingle();
  const s: Session = (existing as Session | null) ?? { owner_id: owner, psid, pin_verified: false, state: "idle", data: {} };
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

  type Draft = { product_id?: string; code?: string; product?: string; price?: number; qty?: number; name?: string; phone?: string; township?: string; address?: string; note?: string };
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
        `🧾 Order summary\n${nd.code} · ${nd.product}\nQty: ${nd.qty} × ${fmt(Number(nd.price))} = ${fmt(total)}\n\nName: ${nd.name}\nPhone: ${nd.phone}\nTownship: ${nd.township}\nAddress: ${nd.address}${nd.note ? `\nNote: ${nd.note}` : ""}\n\nReply YES to confirm or NO to cancel.`,
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
      const o = order as unknown as { order_no: number; total: number };
      return text(psid, `🎉 Order #${o.order_no} confirmed! Total ${fmt(o.total)}. We'll deliver soon. Thank you!`);
    }
  }

  const req = parseProductRequest(msg);
  if (!req) return text(psid, "Send a product code (e.g. 111) or code and quantity (e.g. 111 2).");
  const { data: p } = await db.from("products").select("*").eq("owner_id", owner).eq("code", req.code).eq("active", true).maybeSingle();
  if (!p) return text(psid, `No product found with code ${req.code}.`);

  if (req.qty === null) {
    if (p.image_url) await send(psid, { attachment: { type: "image", payload: { url: `${origin}/api/public/product-image/${encodeURIComponent(p.code)}`, is_reusable: true } } });
    return text(psid, `${p.name}\n💰 ${fmt(Number(p.price))}\n📦 ${p.stock > 0 ? `${p.stock} in stock` : "Out of stock"}${p.description ? `\n\n${p.description}` : ""}\n\nTo order send: ${p.code} 1  (or ${p.code}=2)`);
  }
  if (p.stock < req.qty) return text(psid, p.stock ? `Only ${p.stock} left for ${p.name}.` : `${p.name} is out of stock.`);
  return next("ask_name", { product_id: p.id, code: p.code, product: p.name, price: Number(p.price), qty: req.qty },
    `🛒 ${req.qty} × ${p.name} (${fmt(Number(p.price) * req.qty)})\n\n👤 Your name?  (send NO anytime to cancel)`);
}

export const Route = createFileRoute("/api/public/shop-messenger")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const u = new URL(request.url);
        const expected = process.env["SHOP_FB_VERIFY_TOKEN"];
        if (expected && u.searchParams.get("hub.mode") === "subscribe" && u.searchParams.get("hub.verify_token") === expected) {
          return new Response(u.searchParams.get("hub.challenge") ?? "", { status: 200 });
        }
        return new Response("Forbidden", { status: 403 });
      },
      POST: async ({ request }) => {
        const body = await request.text();
        if (!(await verifySignature(body, request.headers.get("x-hub-signature-256")))) return new Response("Invalid signature", { status: 401 });
        const payload = JSON.parse(body) as { object?: string; entry?: { id: string; messaging?: { sender: { id: string }; message?: { text?: string; is_echo?: boolean }; postback?: { payload?: string } }[] }[] };
        if (payload.object !== "page") return new Response("ok");
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
