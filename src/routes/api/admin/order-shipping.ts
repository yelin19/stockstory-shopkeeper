import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { formatCurrency } from "@/lib/currency";

const envFirst = (...names: string[]) => names.map((name) => process.env[name]).find(Boolean);

export const Route = createFileRoute("/api/admin/order-shipping")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = request.headers.get("authorization");
        const token = auth?.replace(/^Bearer\s+/i, "");
        if (!token) return Response.json({ error: "Unauthorized" }, { status: 401 });
        const parsed = z.object({
          order_id: z.string().uuid(),
          payment_status: z.enum(["approved", "rejected"]).optional(),
          delivery_status: z.enum(["confirmed", "preparing", "shipped", "in_transit", "delivered", "returned"]).optional(),
          tracking_number: z.string().trim().max(200).nullish(),
          tracking_url: z.string().trim().max(2000).nullish(),
          image_url: z.string().trim().url().max(2000).nullish(),
        }).safeParse(await request.json().catch(() => null));
        if (!parsed.success) return Response.json({ error: "Invalid shipping information" }, { status: 400 });
        const body = parsed.data;

        const { createClient } = await import("@supabase/supabase-js");
        const supabaseUrl = process.env["SUPABASE_URL"];
        const publishableKey = process.env["SUPABASE_PUBLISHABLE_KEY"];
        if (!supabaseUrl || !publishableKey) return Response.json({ error: "Shop service is not configured" }, { status: 500 });
        const authClient = createClient(supabaseUrl, publishableKey, { auth: { persistSession: false }, global: { headers: { Authorization: `Bearer ${token}` } } });
        const { data: userData, error: userError } = await authClient.auth.getUser(token);
        if (userError || !userData.user) return Response.json({ error: "Unauthorized" }, { status: 401 });

        const { data: order, error: orderError } = await authClient.from("orders").select("id, owner_id, psid, order_no, public_order_id, product_name, total, delivery_status, payment_status, status").eq("id", body.order_id).eq("owner_id", userData.user.id).maybeSingle();
        if (orderError) return Response.json({ error: orderError.message }, { status: 500 });
        if (!order) return Response.json({ error: "Order not found" }, { status: 404 });
        if (order.status === "cancelled") return Response.json({ error: "Order is cancelled" }, { status: 409 });

        if (body.payment_status) {
          if (body.payment_status === "approved" && !order.psid) return Response.json({ error: "ဒီအော်ဒါမှာ Messenger customer မရှိပါ" }, { status: 400 });
          const now = new Date().toISOString();
          const { error: paymentError } = await authClient.from("orders").update({ payment_status: body.payment_status, payment_approved_at: body.payment_status === "approved" ? now : null, updated_at: now }).eq("id", order.id).eq("owner_id", userData.user.id);
          if (paymentError) return Response.json({ error: paymentError.message }, { status: 500 });
          if (body.payment_status === "approved" && order.psid) {
            const { data: orderCurrency } = await authClient.from("orders").select("currency").eq("id", order.id).eq("owner_id", userData.user.id).maybeSingle();
            const tokenValue = envFirst("SHOP_FB_PAGE_ACCESS_TOKEN", "FB_PAGE_ACCESS_TOKEN");
            if (tokenValue) await fetch(`https://graph.facebook.com/v21.0/me/messages?access_token=${encodeURIComponent(tokenValue)}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ recipient: { id: order.psid }, messaging_type: "UPDATE", message: { text: `✅ Order ID: ${order.public_order_id} ကို Admin မှ ငွေပေးချေမှုအတည်ပြုပြီးပါပြီရှင်။\nပစ္စည်းအမည်: ${order.product_name}\nပေးချေပြီးငွေ: ${formatCurrency(order.total, orderCurrency?.currency)}\nမကြာမီ ပို့ဆောင်ပေးပါမယ်ရှင်။` } }) });
          }
          return Response.json({ ok: true, payment_status: body.payment_status });
        }

        const trackingUrl = body.tracking_url?.trim() || null;
        const trackingNumber = body.tracking_number?.trim() || null;
        const imageUrl = body.image_url?.trim() || null;
        if (body.delivery_status === "returned") {
          const { error: returnedError } = await authClient.from("orders").update({ delivery_status: "returned", updated_at: new Date().toISOString() }).eq("id", order.id).eq("owner_id", userData.user.id);
          if (returnedError) return Response.json({ error: returnedError.message }, { status: 500 });
          return Response.json({ ok: true, returned: true, delivery_status: "returned", message: "ပို့ဆောင်မှုမအောင်မြင်ပါအဖြစ် သိမ်းပြီးပါပြီ" });
        }
        const readyToShip = Boolean(trackingNumber && trackingUrl);
        const deliveryStatus = body.delivery_status ?? (readyToShip ? "shipped" : "confirmed");
        const now = new Date().toISOString();
        if (!readyToShip) {
          const { error: acceptedError } = await authClient.from("orders").update({ delivery_status: deliveryStatus, sent: false, sent_at: null, tracking_number: trackingNumber, tracking_url: trackingUrl, delivery_image_url: imageUrl, delivery_notified_at: null, updated_at: now }).eq("id", order.id).eq("owner_id", userData.user.id);
          if (acceptedError) return Response.json({ error: acceptedError.message }, { status: 500 });
          return Response.json({ ok: true, accepted: true, delivery_status: deliveryStatus, message: "Tracking ID နှင့် Link နှစ်ခုလုံးမပြည့်သေးပါသဖြင့် အခြေအနေကိုသိမ်းပြီးပါပြီ" });
        }
        if (!order.psid) return Response.json({ error: "ဒီအော်ဒါမှာ Messenger customer မရှိပါ" }, { status: 400 });
        if (!/^https?:\/\//i.test(trackingUrl ?? "")) return Response.json({ error: "Invalid tracking link" }, { status: 400 });
        const tokenValue = envFirst("SHOP_FB_PAGE_ACCESS_TOKEN", "FB_PAGE_ACCESS_TOKEN");
        if (!tokenValue) return Response.json({ error: "Facebook Page Access Token မတွေ့ပါ" }, { status: 500 });

        const orderId = order.public_order_id ?? String(order.order_no).padStart(6, "0");
        const statusMessage: Record<string, string> = {
          confirmed: "အော်ဒါလက်ခံပြီးပါပြီ",
          preparing: "ပစ္စည်းပြင်ဆင်နေပါပြီ",
          shipped: "ပို့ဆောင်ပေးနေပါပြီ",
          in_transit: "ပို့ဆောင်နေပါပြီ",
          delivered: "ပစ္စည်းရောက်ရှိပြီးပါပြီ",
        };
        const message = `🚚 ဝယ်ယူမှု ID: ${orderId} အခြေအနေ — ${statusMessage[deliveryStatus] ?? statusMessage["shipped"]}\nပစ္စည်းအမည်: ${order.product_name}\nစာတိုက် Tracking ID: ${trackingNumber}\nTracking link: ${trackingUrl}`;
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

        const { error: updateError } = await authClient.from("orders").update({ delivery_status: deliveryStatus, sent: true, sent_at: now, tracking_number: trackingNumber, tracking_url: trackingUrl, delivery_image_url: imageUrl, delivery_notified_at: now, updated_at: now }).eq("id", order.id).eq("owner_id", userData.user.id);
        if (updateError) return Response.json({ error: updateError.message }, { status: 500 });
        return Response.json({ ok: true, public_order_id: orderId, delivery_status: deliveryStatus, notified: true });
      },
    },
  },
});
