// @vitest-environment node
import { beforeEach, afterEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  post: undefined as undefined | ((args: { request: Request }) => Promise<Response>),
  update: vi.fn(), from: vi.fn(), getUser: vi.fn(), send: vi.fn(), remove: vi.fn(),
}));
vi.mock("@tanstack/react-router", () => ({ createFileRoute: () => (options: { server: { handlers: { POST: typeof mocks.post } } }) => { mocks.post = options.server.handlers.POST; return options; } }));
vi.mock("@supabase/supabase-js", () => ({ createClient: () => ({ auth: { getUser: mocks.getUser }, from: mocks.from }) }));
vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: { storage: { from: () => ({ remove: mocks.remove }) } } }));
import "@/routes/api/admin/order-shipping";

beforeEach(() => {
  vi.stubEnv("SUPABASE_URL", "https://example.test");
  vi.stubEnv("SUPABASE_PUBLISHABLE_KEY", "test-publishable-key");
  vi.stubEnv("SHOP_FB_PAGE_ACCESS_TOKEN", "test-page-token");
  mocks.getUser.mockResolvedValue({ data: { user: { id: "owner-test" } }, error: null });
  mocks.update.mockReset();
  mocks.remove.mockReset().mockResolvedValue({ data: [], error: null });
  const chain = { select: vi.fn(() => chain), eq: vi.fn(() => chain), update: mocks.update,
    maybeSingle: vi.fn(async () => ({ data: { id: "00000000-0000-4000-8000-000000000001", owner_id: "owner-test", psid: "test-customer", public_order_id: "100001", status: "confirmed" }, error: null })),
    then: (resolve: (value: { error: null }) => unknown) => Promise.resolve({ error: null }).then(resolve),
  };
  mocks.update.mockReturnValue(chain);
  mocks.from.mockReturnValue(chain);
  mocks.send.mockReset().mockResolvedValue(new Response("{}", { status: 200 }));
  vi.stubGlobal("fetch", mocks.send);
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

async function save(tracking_number: string, tracking_url: string, delivery_status = "confirmed", image_url?: string, image_path?: string) {
  if (!mocks.post) throw new Error("Shipping handler missing");
  return mocks.post({ request: new Request("http://localhost/api/admin/order-shipping", { method: "POST", headers: { authorization: "Bearer test-session", "content-type": "application/json" }, body: JSON.stringify({ order_id: "00000000-0000-4000-8000-000000000001", tracking_number, tracking_url, delivery_status, image_url, image_path }) }) });
}
it("saves the selected delivery status but sends no Messenger message when Tracking ID is missing", async () => {
  const result = await save("   ", "https://tracking.test/100001", "delivered");
  expect(result.status).toBe(200);
  expect(await result.json()).toMatchObject({ accepted: true });
  expect(mocks.update).toHaveBeenCalledWith(expect.objectContaining({ delivery_status: "delivered", sent: false, sent_at: null, delivery_notified_at: null }));
  expect(mocks.send).not.toHaveBeenCalled();
});
it("saves the selected delivery status but sends no Messenger message when Tracking link is missing", async () => {
  const result = await save("TRACK-100001", "   ", "delivered");
  expect(result.status).toBe(200);
  expect(mocks.update).toHaveBeenCalledWith(expect.objectContaining({ delivery_status: "delivered", sent: false }));
  expect(mocks.send).not.toHaveBeenCalled();
});
it("marks the order in transit and sends tracking to Messenger only when both fields are provided", async () => {
  const result = await save(" TRACK-100001 ", " https://tracking.test/100001 ");
  expect(result.status).toBe(200);
  expect(mocks.send).toHaveBeenCalledTimes(1);
  const payload = JSON.parse(mocks.send.mock.calls[0]?.[1]?.body ?? "{}");
  expect(payload.message.text).toContain("TRACK-100001");
  expect(payload.message.text).toContain("https://tracking.test/100001");
  expect(payload.message.text).toContain("ပို့ဆောင်နေပါပြီ");
  expect(mocks.update).toHaveBeenCalledWith(expect.objectContaining({ delivery_status: "in_transit", sent: true }));
});
it("keeps an explicitly selected delivered status when both tracking fields are provided", async () => {
  const result = await save("TRACK-100001", "https://tracking.test/100001", "delivered");
  expect(result.status).toBe(200);
  expect(mocks.update).toHaveBeenCalledWith(expect.objectContaining({ delivery_status: "delivered", sent: true }));
});
it("sends the delivery photo to Messenger, removes its temporary file, and never stores the image URL in the order", async () => {
  const result = await save("TRACK-100001", "https://tracking.test/100001", "shipped", "https://storage.test/delivery-images/owner-test/photo.jpg", "owner-test/photo.jpg");
  expect(result.status).toBe(200);
  expect(mocks.send).toHaveBeenCalledTimes(2);
  const imagePayload = JSON.parse(mocks.send.mock.calls[1]?.[1]?.body ?? "{}");
  expect(imagePayload.message.attachment.payload.url).toBe("https://storage.test/delivery-images/owner-test/photo.jpg");
  expect(mocks.remove).toHaveBeenCalledWith(["owner-test/photo.jpg"]);
  expect(mocks.update.mock.calls[0]?.[0]).not.toHaveProperty("delivery_image_url");
});
it("rejects a photo without both Tracking ID and link so it is not stored without being sent", async () => {
  const result = await save("", "https://tracking.test/100001", "confirmed", "https://storage.test/delivery-images/owner-test/photo.jpg", "owner-test/photo.jpg");
  expect(result.status).toBe(400);
  expect(mocks.update).not.toHaveBeenCalled();
  expect(mocks.send).not.toHaveBeenCalled();
});
it("does not mark shipped if Messenger rejects the notification", async () => {
  mocks.send.mockResolvedValue(new Response("{}", { status: 400 }));
  expect((await save("TRACK-100001", "https://tracking.test/100001")).status).toBe(502);
  expect(mocks.update).not.toHaveBeenCalled();
});
