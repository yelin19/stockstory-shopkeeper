import { createFileRoute } from "@tanstack/react-router";

const envFirst = (...names: string[]) => names.map((name) => process.env[name]).find(Boolean);

export const Route = createFileRoute("/api/admin/order-shipping")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = request.headers.get("authorization");
        const token = auth?.replace(/^Bearer\s+/i, "");
        if (!token) return Response.json({ error: "Unauthorized" }, { status: 401 });
        const body = await request.json() as { order_id?: string; tracking_url?: string | null; tracking_number?: string | null; image_url?: string | null };
        if (!body.order_id) return Response.json({ error: "order_id is required" }, { status: 400 });

        const { createClient } = await import("@supabase/supabase-js");
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const supabaseUrl = process.env.SUPABASE_URL;
        const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY;
        if (!supabaseUrl || !publishableKey) return Response.json({ error: "Supabase is not configured" }, { status: 500 });
        const authClient = createClient(supabaseUrl, publishableKey, { auth: { persistSession: false } });
        const { data: userData, error: userError } = await authClient.auth.getUser(token);
        if (userError || !userData.user) return Response.json({ error: "Unauthorized" }, { status: 401 });

        const { data: order, error: orderError } = await supabaseAdmin.from("orders").select("id, owner_id, psid, order_no, customer_name, delivery_status").eq("id", body.order_id).eq("owner_id", userData.user.id).maybeSingle();
        if (orderError) return Response.json({ error: orderError.message }, { status: 500 });
        if (!order) return Response.json({ error: "Order not found" }, { status: 404 });
        if (!order.psid) return Response.json({ error: "ဒီအော်ဒါမှာ Messenger customer မရှိပါ" }, { status: 400 });

        const trackingUrl = body.tracking_url?.trim() || null;
        const trackingNumber = body.tracking_number?.trim() || null;
        const imageUrl = body.image_url?.trim() || null;
        const tokenValue = envFirst("SHOP_FB_PAGE_ACCESS_TOKEN", "FB_PAGE_ACCESS_TOKEN");
        if (!tokenValue) return Response.json({ error: "Facebook Page Access Token မတွေ့ပါ" }, { status: 500 });

        const message = `🚚 ဝယ်ယူမှု ID #${order.order_no} ကို ပို့ဆောင်ပေးလိုက်ပါပြီ။${trackingNumber ? `\nစာတိုက် Tracking No: ${trackingNumber}` : ""}${trackingUrl ? `\nTracking link: ${trackingUrl}` : ""}`;
        const sendText = await fetch(`https://graph.facebook.com/v21.0/me/messages?access_token=${encodeURIComponent(tokenValue)}`, {
          method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ recipient: { id: order.psid }, messaging_type: "UPDATE", message: { text: message } }),
        });
        if (!sendText.ok) return Response.json({ error: "Messenger သို့ စာပို့မရပါ" }, { status: 502 });
        if (imageUrl) {
          const sendImage = await fetch(`https://graph.facebook.com/v21.0/me/messages?access_token=${encodeURIComponent(tokenValue)}`, {
            method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ recipient: { id: order.psid }, messaging_type: "UPDATE", message: { attachment: { type: "image", payload: { url: imageUrl, is_reusable: true } } } }),
          });
          if (!sendImage.ok) return Response.json({ error: "ပို့ဆောင်မှုဓာတ်ပုံကို Messenger သို့ ပို့မရပါ" }, { status: 502 });
        }

        const { error: updateError } = await supabaseAdmin.from("orders").update({ delivery_status: "shipped", tracking_number: trackingNumber, tracking_url: trackingUrl, delivery_image_url: imageUrl, delivery_notified_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", order.id).eq("owner_id", userData.user.id);
        if (updateError) return Response.json({ error: updateError.message }, { status: 500 });
        return Response.json({ ok: true, order_no: order.order_no });
      },
    },
  },
});
