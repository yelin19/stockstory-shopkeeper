type Admin = Awaited<typeof import("@/integrations/supabase/client.server")>["supabaseAdmin"];
import { formatLowStockAlertMessage } from "@/lib/low-stock-alert";

type LowStockAlert = {
  product_id: string;
  product_code: string;
  product_name: string;
  stock: number;
  threshold: number;
  recipient_psid: string;
};

const envFirst = (...names: string[]) => names.map((name) => process.env[name]).find(Boolean);
const callRpc = (db: Admin, name: string, args: Record<string, unknown>) =>
  (db.rpc as unknown as (fn: string, params: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>)(name, args);

export async function dispatchLowStockAlerts(ownerId: string, productId: string | null = null) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await callRpc(supabaseAdmin, "claim_low_stock_alerts", {
    _owner: ownerId,
    _product_id: productId,
  });
  if (error) throw new Error(error.message);

  const alerts = (Array.isArray(data) ? data : data ? [data] : []) as LowStockAlert[];
  let sent = 0;
  let failed = 0;
  const token = envFirst("SHOP_FB_PAGE_ACCESS_TOKEN", "FB_PAGE_ACCESS_TOKEN");

  for (const alert of alerts) {
    if (!token) {
      failed += 1;
      await callRpc(supabaseAdmin, "release_low_stock_alert", { _product_id: alert.product_id });
      continue;
    }

    try {
      const response = await fetch(`https://graph.facebook.com/v21.0/me/messages?access_token=${encodeURIComponent(token)}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          recipient: { id: alert.recipient_psid },
          messaging_type: "UPDATE",
          message: { text: formatLowStockAlertMessage(alert) },
        }),
      });

      if (!response.ok) {
        failed += 1;
        console.error("Low-stock Messenger alert was not accepted", response.status);
        await callRpc(supabaseAdmin, "release_low_stock_alert", { _product_id: alert.product_id });
        continue;
      }
      sent += 1;
    } catch (error) {
      failed += 1;
      console.error("Low-stock Messenger alert request failed", error);
      await callRpc(supabaseAdmin, "release_low_stock_alert", { _product_id: alert.product_id });
    }
  }

  return { sent, failed };
}
