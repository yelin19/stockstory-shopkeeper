// @vitest-environment node
import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { createHmac } from "node:crypto";
const db = vi.hoisted(() => ({ from: vi.fn(), rpc: vi.fn() }));
vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: db }));
vi.mock("@tanstack/react-router", () => ({ createFileRoute: () => (options: unknown) => options }));
import { messengerHandlers } from "@/routes/api/public/shop-messenger";
const secret = "test-only-secret";
const page = "1435456272977322";
let saved: Record<string, unknown> | null;
const product = { id: "00000000-0000-4000-8000-000000000001", code: "ABC123", name: "Test", price: 10, stock: 5, unit: "ခု", allow_prepaid: true, allow_home_delivery_cash: true };
beforeEach(() => {
  saved = null;
  vi.stubEnv("SHOP_FB_APP_SECRET", secret);
  vi.stubEnv("SHOP_FB_PAGE_ACCESS_TOKEN", "test-only-token");
  vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 200 })));
  db.from.mockReset(); db.rpc.mockReset();
  db.from.mockImplementation((table: string) => {
    const result = { data: table === "shop_settings" ? [{ owner_id: "owner", fb_page_id: ` ${page} ` }] : [], error: null };
    const chain = {
      select: vi.fn(() => chain), eq: vi.fn(() => chain), neq: vi.fn(() => chain), order: vi.fn(() => chain), limit: vi.fn(() => chain),
      maybeSingle: vi.fn(async () => ({ data: table === "shop_settings" ? { currency: "MMK" } : table === "products" ? product : table === "messenger_sessions" ? saved : null, error: null })),
      upsert: vi.fn(async (value) => { saved = value; return { error: null }; }),
      insert: vi.fn(async () => ({ error: null })), update: vi.fn(() => chain),
      then: (resolve: (value: unknown) => unknown) => Promise.resolve(result).then(resolve),
    }; return chain;
  });
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
function request(entry: unknown, valid = true) {
  const body = JSON.stringify({ object: "page", entry: [entry] });
  return new Request("http://localhost/api/public/shop-messenger", { method: "POST", body, headers: { "x-hub-signature-256": `sha256=${createHmac("sha256", valid ? secret : "wrong").update(body).digest("hex")}` } });
}
it("rejects invalid signatures before database access", async () => {
  expect((await messengerHandlers.POST({ request: request({ id: page }, false) })).status).toBe(401);
  expect(db.from).not.toHaveBeenCalled();
});
it("skips Page mismatches without private reply or session mutation", async () => {
  await messengerHandlers.POST({ request: request({ id: "999", changes: [{ field: "feed", value: { item: "comment", verb: "add", comment_id: "123_456", from: { id: "987" }, message: "ABC123" } }] }) });
  expect(fetch).not.toHaveBeenCalled(); expect(saved).toBeNull();
});
it("production Messenger message asks for confirmation before saving an order draft", async () => {
  expect((await messengerHandlers.POST({ request: request({ id: page, messaging: [{ sender: { id: "987" }, message: { text: "ABC123=2" } }] }) })).status).toBe(200);
  expect(saved).toMatchObject({ psid: "987", state: "order_confirmation", data: { pending_code: "ABC123", pending_qty: 2 } });
  expect(fetch).toHaveBeenCalled(); expect(db.rpc).not.toHaveBeenCalled();
});
it("production feed private reply does not misuse from.id as Messenger PSID", async () => {
  await messengerHandlers.POST({ request: request({ id: page, changes: [{ field: "feed", value: { item: "comment", verb: "add", comment_id: "123_456", from: { id: "987" }, message: "ABC123=2" } }] }) });
  expect(fetch).toHaveBeenCalledOnce(); expect(saved).toBeNull(); expect(db.rpc).not.toHaveBeenCalled();
});
