import { formatCurrency } from "@/lib/currency";
import { formatQuantity } from "@/lib/product-unit";

const envFirst = (...names: string[]) => names.map((name) => process.env[name]).find(Boolean);

export type PaymentProofReview = {
  orderId: string;
  product: string;
  quantity: number;
  unit: string;
  total: number;
  currency?: string | null;
  customerName: string;
  phone: string;
  address: string;
};

export function formatPaymentProofReviewMessage(order: PaymentProofReview) {
  return `🧾 ကြိုတင်ငွေလွှဲအော်ဒါ စစ်ဆေးရန်\nOrder ID: ${order.orderId}\nပစ္စည်း: ${order.product}\nအရေအတွက်: ${formatQuantity(order.quantity, order.unit)}\nစုစုပေါင်း: ${formatCurrency(order.total, order.currency)}\nဝယ်သူ: ${order.customerName}\nဖုန်း: ${order.phone}\nလိပ်စာ: ${order.address}\n\nငွေလွှဲဖြတ်ပိုင်းပုံကို အပေါ်တွင် ပို့ထားပါသည်။ အောက်ပါခလုတ်ကိုနှိပ်၍ အတည်ပြု သို့မဟုတ် ပယ်ဖျက်နိုင်ပါသည်။`;
}

export function paymentReviewButtonTemplate(orderId: string) {
  return {
    attachment: {
      type: "template",
      payload: {
        template_type: "button",
        text: `Order ID: ${orderId}\nလုပ်ဆောင်ချက်ကို ရွေးပါ။`,
        buttons: [
          { type: "postback", title: "✅ အတည်ပြု", payload: `PAYMENT_REVIEW_APPROVE:${orderId}` },
          { type: "postback", title: "❌ ပယ်ဖျက်", payload: `PAYMENT_REVIEW_CANCEL:${orderId}` },
        ],
      },
    },
  };
}

export type PaymentProofDelivery = {
  textSent: boolean;
  receiptSent: boolean;
  reason?: "missing_page_token" | "missing_receipt" | "facebook_rejected" | "network_error";
};

type MessengerError = { message?: string; type?: string; code?: number; error_subcode?: number; fbtrace_id?: string };

export async function sendPaymentProofNotification(
  recipientPsid: string,
  messageText: string,
  receiptUrl: string,
  orderId: string,
): Promise<PaymentProofDelivery> {
  const token = envFirst("SHOP_FB_PAGE_ACCESS_TOKEN", "FB_PAGE_ACCESS_TOKEN");
  if (!token) return { textSent: false, receiptSent: false, reason: "missing_page_token" };
  if (!receiptUrl) return { textSent: false, receiptSent: false, reason: "missing_receipt" };

  const endpoint = `https://graph.facebook.com/v21.0/me/messages?access_token=${encodeURIComponent(token)}`;
  let reason: PaymentProofDelivery["reason"];
  const sendMessage = async (message: Record<string, unknown>) => {
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ recipient: { id: recipientPsid }, messaging_type: "UPDATE", message }),
      });
      const responseBody = await response.json().catch(() => null) as { error?: MessengerError; message_id?: string } | null;
      if (!response.ok) {
        reason = "facebook_rejected";
        console.error("Prepaid order review Messenger message was rejected", {
          status: response.status,
          error: responseBody?.error,
        });
      }
      return response.ok;
    } catch (error) {
      reason = "network_error";
      console.error("Prepaid order review Messenger notification failed", (error as Error).message);
      return false;
    }
  };

  const receiptSent = await sendMessage({ attachment: { type: "image", payload: { url: receiptUrl } } });
  const detailsSent = await sendMessage({ text: messageText });
  const buttonsSent = await sendMessage(paymentReviewButtonTemplate(orderId));
  const textSent = detailsSent && buttonsSent;

  return {
    textSent,
    receiptSent,
    ...(!textSent || !receiptSent ? { reason: reason ?? "facebook_rejected" } : {}),
  };
}
