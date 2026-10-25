import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { formatPaymentProofReviewMessage, sendPaymentProofNotification } from "@/lib/payment-proof-notification.server";

const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response("{}", { status: 200 }));

beforeEach(() => {
  vi.stubEnv("SHOP_FB_PAGE_ACCESS_TOKEN", "test-page-token");
  vi.stubEnv("FB_PAGE_ACCESS_TOKEN", "");
  fetchMock.mockClear();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("payment proof review notification", () => {
  it("includes order and customer details in the admin review message", () => {
    const message = formatPaymentProofReviewMessage({
      orderId: "100021",
      product: "ဖိနပ်",
      quantity: 2,
      unit: "ရံ",
      total: 2000,
      currency: "THB",
      customerName: "မောင်မောင်",
      phone: "0912345678",
      address: "ရန်ကုန်",
    });

    expect(message).toContain("Order ID: 100021");
    expect(message).toContain("အရေအတွက်: 2ရံ");
    expect(message).toContain("ဝယ်သူ: မောင်မောင်");
    expect(message).toContain("0912345678");
    expect(message).toContain("ရန်ကုန်");
  });

  it("sends an UPDATE text and the payment receipt image to the configured recipient", async () => {
    const result = await sendPaymentProofNotification("paired-admin-psid", "Order ID: 100021", "https://receipt.test/proof.jpg");

    expect(result).toEqual({ textSent: true, receiptSent: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const sent = fetchMock.mock.calls.map(([, init]) => JSON.parse(String(init?.body)) as {
      recipient: { id: string };
      messaging_type: string;
      message: { text?: string; attachment?: { payload?: { url?: string } } };
    });
    expect(sent.every((payload) => payload.recipient.id === "paired-admin-psid" && payload.messaging_type === "UPDATE")).toBe(true);
    expect(sent[0]?.message.text).toBe("Order ID: 100021");
    expect(sent[1]?.message.attachment?.payload?.url).toBe("https://receipt.test/proof.jpg");
  });

  it("does not call Messenger if the Page token or receipt URL is missing", async () => {
    vi.stubEnv("SHOP_FB_PAGE_ACCESS_TOKEN", "");
    expect(await sendPaymentProofNotification("paired-admin-psid", "review", "https://receipt.test/proof.jpg")).toMatchObject({ reason: "missing_page_token" });
    vi.stubEnv("SHOP_FB_PAGE_ACCESS_TOKEN", "test-page-token");
    expect(await sendPaymentProofNotification("paired-admin-psid", "review", "")).toMatchObject({ reason: "missing_receipt" });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
