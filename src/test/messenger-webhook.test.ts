// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createHmac } from "node:crypto";
import { messengerHandlers } from "@/lib/shop-messenger.server";

const database = vi.hoisted(() => ({ from: vi.fn(), rpc: vi.fn() }));
vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: database }));

const secret = "test-only-messenger-signing-key";
let session: Record<string, unknown> | null;
const product = { id: "00000000-0000-4000-8000-000000000001", code: "111", name: "Test item", price: 1000, stock: 5 };

function signedRequest(body: string) {
  const signature = createHmac("sha256", secret).update(body).digest("hex");
  return new Request("http://localhost/api/public/shop-messenger", {
    method: "POST", body, headers: { "x-hub-signature-256": `sha256=${signature}` },
  });
}
async function message(text: string) {
  return messengerHandlers.POST({ request: signedRequest(JSON.stringify({ object: "page", entry: [{ id: "123", messaging: [{ sender: { id: "456" }, message: { text } }] }] })) });
}

beforeEach(() => {
  vi.stubEnv("SHOP_FB_APP_SECRET", secret);
  vi.stubEnv("SHOP_FB_VERIFY_TOKEN", "test-only-verify-token");
  vi.stubEnv("SHOP_FB_PAGE_ACCESS_TOKEN", "");
  session = null;
  database.from.mockReset();
  database.rpc.mockReset();
  database.from.mockImplementation((table: string) => {
    const chain = {
      select: vi.fn(() => chain), eq: vi.fn(() => chain),
      maybeSingle: vi.fn(async () => ({ data: table === "shop_settings" ? { owner_id: "owner-test" } : table === "products" ? product : session, error: null })),
      upsert: vi.fn(async (value: Record<string, unknown>) => { session = value; return { error: null }; }),
    };
    return chain;
  });
  database.rpc.mockImplementation(async (name: string) => ({ data: name === "verify_shop_pin" ? true : { order_no: 42, total: 2000 }, error: null }));
});
afterEach(() => vi.unstubAllEnvs());

describe("Messenger webhook", () => {
  it("returns the Facebook verification challenge only for the matching token", async () => {
    const response = await messengerHandlers.GET({ request: new Request("http://localhost/api/public/shop-messenger?hub.mode=subscribe&hub.verify_token=test-only-verify-token&hub.challenge=12345") });
    expect(response.status).toBe(200);
    expect(await response.text()).toBe("12345");
    const rejected = await messengerHandlers.GET({ request: new Request("http://localhost/api/public/shop-messenger?hub.mode=subscribe&hub.verify_token=wrong&hub.challenge=12345") });
    expect(rejected.status).toBe(403);
  });
  it("rejects unsigned writes before accessing the database", async () => {
    const response = await messengerHandlers.POST({ request: new Request("http://localhost/api/public/shop-messenger", { method: "POST", body: "{}" }) });
    expect(response.status).toBe(401);
    expect(database.from).not.toHaveBeenCalled();
  });
  it("rejects malformed signed JSON without accessing the database", async () => {
    const response = await messengerHandlers.POST({ request: signedRequest("{") });
    expect(response.status).toBe(400);
    expect(database.from).not.toHaveBeenCalled();
  });
  it("rejects malformed signed events without accessing the database", async () => {
    const response = await messengerHandlers.POST({ request: signedRequest(JSON.stringify({ object: "page", entry: [{ id: "123", messaging: [{ message: { text: "YES" } }] }] })) });
    expect(response.status).toBe(400);
    expect(database.from).not.toHaveBeenCalled();
  });
  it("saves the customer order through place_order only after YES", async () => {
    for (const input of ["1234", "111 2", "Test Customer", "09123456789", "Yangon", "Test delivery address", "-"]) {
      expect((await message(input)).status).toBe(200);
    }
    expect(database.rpc.mock.calls.filter(([name]) => name === "place_order")).toHaveLength(0);
    expect((await message("YES")).status).toBe(200);
    expect(database.rpc).toHaveBeenCalledWith("place_order", {
      _owner: "owner-test", _psid: "456", _product_id: product.id, _qty: 2,
      _name: "Test Customer", _phone: "09123456789", _township: "Yangon", _address: "Test delivery address", _note: "",
    });
    expect(session).toMatchObject({ state: "idle", data: {} });
  });
  it("never places an order when the customer cancels", async () => {
    for (const input of ["1234", "111 2", "NO"]) await message(input);
    expect(database.rpc.mock.calls.filter(([name]) => name === "place_order")).toHaveLength(0);
    expect(session).toMatchObject({ state: "idle", data: {} });
  });
});