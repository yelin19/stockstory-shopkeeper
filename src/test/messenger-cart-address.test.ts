// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createHmac } from "node:crypto";
import { messengerHandlers } from "@/routes/api/public/shop-messenger";

type Row = Record<string, unknown>;
type Chain = {
  select: () => Chain;
  eq: (column: string, value: unknown) => Chain;
  neq: (column: string, value: unknown) => Chain;
  gt: (column: string, value: unknown) => Chain;
  in: (column: string, values: unknown[]) => Chain;
  order: (column: string, options?: unknown) => Chain;
  limit: (count: number) => Chain;
  maybeSingle: () => Promise<{ data: Row | null; error: null }>;
  upsert: (value: Row) => Promise<{ error: null }>;
  insert: (value: Row) => Promise<{ error: null }>;
  update: (value: Row) => Chain;
  then: (
    resolve: (value: unknown) => unknown,
    reject: (reason: unknown) => unknown,
  ) => Promise<unknown>;
};

const database = vi.hoisted(() => ({ from: vi.fn(), rpc: vi.fn() }));
vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: database }));

const secret = "test-only-messenger-signing-key";
const product = {
  id: "00000000-0000-4000-8000-000000000001",
  owner_id: "owner-test",
  code: "111",
  name: "Test item",
  unit: "ခု",
  price: 1000,
  stock: 5,
  allow_prepaid: false,
  allow_seller_delivery_cash: true,
  active: true,
};
const shop = {
  owner_id: "owner-test",
  currency: "THB",
  fb_page_id: "123",
  messenger_username: "testshop",
  low_stock_alert_psid: null,
  low_stock_alert_pin_hash: null,
};
let session: Row | null;
let previousOrder: Row | null;
let customerProfile: Row | null;
const sentMessages: Row[] = [];

function signedRequest(body: string) {
  const signature = createHmac("sha256", secret).update(body).digest("hex");
  return new Request("http://localhost/api/public/shop-messenger", {
    method: "POST",
    body,
    headers: { "x-hub-signature-256": `sha256=${signature}` },
  });
}
async function message(text: string) {
  return messengerHandlers.POST({
    request: signedRequest(
      JSON.stringify({
        object: "page",
        entry: [{ id: "123", messaging: [{ sender: { id: "456" }, message: { text } }] }],
      }),
    ),
  });
}

beforeEach(() => {
  vi.stubEnv("SHOP_FB_APP_SECRET", secret);
  vi.stubEnv("SHOP_FB_VERIFY_TOKEN", "test-only-verify-token");
  vi.stubEnv("SHOP_FB_PAGE_ACCESS_TOKEN", "test-only-page-access-token");
  session = null;
  previousOrder = null;
  customerProfile = null;
  sentMessages.length = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      if (typeof init?.body === "string") {
        const requestBody = JSON.parse(init.body) as {
          message?: Record<string, unknown>;
        };
        if (requestBody.message) sentMessages.push(requestBody.message);
      }
      return new Response(null, { status: 200 });
    }),
  );
  database.from.mockReset();
  database.rpc.mockReset();
  database.from.mockImplementation((table: string): Chain => {
    const filters: Record<string, unknown> = {};
    const rows = () => {
      const base: Row[] =
        table === "messenger_customer_profiles"
          ? customerProfile
            ? [customerProfile]
            : []
          : table === "messenger_sessions"
          ? session
            ? [session]
            : []
          : table === "products"
            ? [product]
            : table === "shop_settings"
              ? [shop]
              : table === "orders"
                ? previousOrder
                  ? [previousOrder]
                  : []
                : [];
      return base.filter((row) =>
        Object.entries(filters).every(([key, value]) =>
          key.startsWith("in:")
            ? (value as unknown[]).includes(row[key.slice(3)])
            : row[key] === value,
        ),
      );
    };
    const chain: Chain = {
      select: () => chain,
      eq: (column, value) => {
        filters[column] = value;
        return chain;
      },
      neq: () => chain,
      gt: () => chain,
      in: (column, values) => {
        filters[`in:${column}`] = values;
        return chain;
      },
      order: () => chain,
      limit: () => chain,
      maybeSingle: async () => ({ data: rows()[0] ?? null, error: null }),
      upsert: async (value) => {
        if (table === "messenger_sessions") session = { ...value };
        if (table === "messenger_customer_profiles") customerProfile = { ...value };
        return { error: null };
      },
      insert: async () => ({ error: null }),
      update: () => chain,
      then: (resolve, reject) =>
        Promise.resolve({ data: rows(), error: null }).then(resolve, reject),
    };
    return chain;
  });
  database.rpc.mockImplementation(async (name: string) => {
    if (name === "verify_shop_pin") return { data: true, error: null };
    if (name === "place_cart_orders_from_messenger") {
      return {
        data: [
          {
            id: "row-1",
            public_order_id: "100001",
            order_no: 1,
            product_id: product.id,
            total: 2000,
          },
        ],
        error: null,
      };
    }
    return { data: null, error: null };
  });
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

const cartWithAddress = [
  "CART_ORDER",
  "ADDR_PROVINCE: 74|สค|สมุทรสาคร",
  "ADDR_DISTRICT: 7401|เมืองสมุทรสาคร",
  "ADDR_SUBDISTRICT: 740101|มหาชัย|74000",
  "ADDR_DETAIL: 123/4 หมู่ 5",
  "1. Test item — 2 ခု [111]",
  "",
  "အော်ဒါတင်ရန် ပို့ပေးပါသည်။",
].join("\n");

const cartWithMultiplePostalCode = [
  "CART_ORDER",
  "ADDR_PROVINCE: 81|กบ|กระบี่",
  "ADDR_DISTRICT: 8101|เมืองกระบี่",
  `ADDR_SUBDISTRICT: 810116|อ่าวนาง|81210|${encodeURIComponent("ม.7 - 8")}`,
  "ADDR_DETAIL: 123/4 หมู่ 7",
  "1. Test item — 2 ခု [111]",
  "",
  "အော်ဒါတင်ရန် ပို့ပေးပါသည်။",
].join("\n");

describe("Messenger cart order with a website-selected address", () => {
  it("keeps the province and asks only for name and phone before placing the order", async () => {
    await message(cartWithAddress);
    const initialMessage = String(sentMessages.at(-1)?.["text"] ?? "");
    expect(initialMessage).toContain("🛒 Cart အော်ဒါစာရင်း");
    expect(initialMessage).toContain("စုစုပေါင်း:");
    expect(initialMessage).toContain(
      "ที่อยู่: 123/4 หมู่ 5, ตำบลมหาชัย, อำเภอเมืองสมุทรสาคร, จังหวัดสมุทรสาคร, 74000",
    );
    expect(initialMessage).not.toContain("รายการสั่งซื้อ");
    expect(sentMessages.at(-1)?.["quick_replies"]).toMatchObject([
      { title: "အတည်ပြု", payload: "YES" },
      { title: "မယူတော့ဘူး", payload: "NO" },
    ]);
    expect(session?.["state"]).toBe("cart_confirm");
    expect(session?.["data"]).toMatchObject({
      township: "เมืองสมุทรสาคร",
      address: "123/4 หมู่ 5",
      province_code: "74",
      province_abbr: "สค",
      province_name: "สมุทรสาคร",
      district_name: "เมืองสมุทรสาคร",
      subdistrict_name: "มหาชัย",
      postal_code: "74000",
    });

    await message("အတည်ပြု");
    expect(session?.["state"]).toBe("ask_name_phone");
    expect(String(sentMessages.at(-1)?.["text"] ?? "")).toContain("အမည်");
    expect(String(sentMessages.at(-1)?.["text"] ?? "")).toContain("ตำบลมหาชัย");

    await message("Test Customer\n09123456789");
    expect(session?.["state"]).toBe("confirm");
    const confirmationMessage = String(sentMessages.at(-1)?.["text"] ?? "");
    expect(confirmationMessage).toContain("🧾 အော်ဒါစာရင်း");
    expect(confirmationMessage).toContain("ชื่อผู้รับ: Test Customer");
    expect(confirmationMessage).toContain("เบอร์โทรศัพท์: 09123456789");
    expect(confirmationMessage).toContain(
      "ที่อยู่: 123/4 หมู่ 5, ตำบลมหาชัย, อำเภอเมืองสมุทรสาคร, จังหวัดสมุทรสาคร, 74000",
    );
    expect(confirmationMessage).not.toContain("အမည်:");
    expect(confirmationMessage).not.toContain("หมายเลขโทรศัพท์:");
    expect(sentMessages.at(-1)?.["quick_replies"]).toMatchObject([
      { title: "အတည်ပြု", payload: "YES" },
      { title: "ပြင်မည်", payload: "NO" },
    ]);

    await message("အတည်ပြု");
    const completedMessage = String(sentMessages.at(-1)?.["text"] ?? "");
    expect(completedMessage).toContain("Cart ထဲက ပစ္စည်းများကို အော်ဒါတင်ပြီးပါပြီရှင်။");
    expect(completedMessage).toContain("ชื่อผู้รับ: Test Customer");
    expect(completedMessage).toContain("ที่อยู่: 123/4 หมู่ 5");
    expect(completedMessage).not.toContain("အမည်:");
    expect(database.rpc).toHaveBeenCalledWith(
      "place_cart_orders_from_messenger",
      expect.objectContaining({
        _owner: "owner-test",
        _psid: "456",
        _items: [{ product_id: product.id, qty: 2 }],
        _name: "Test Customer",
        _phone: "09123456789",
        _township: "เมืองสมุทรสาคร",
        _address: "123/4 หมู่ 5, มหาชัย, สมุทรสาคร, 74000",
        _payment_method: "seller_delivery_cash",
      }),
    );
    expect(session).toMatchObject({ state: "idle" });
  });

  it("preserves a selected secondary postcode and village range in the order address", async () => {
    await message(cartWithMultiplePostalCode);
    expect(session?.["data"]).toMatchObject({
      township: "เมืองกระบี่",
      address: "123/4 หมู่ 7",
      province_name: "กระบี่",
      district_name: "เมืองกระบี่",
      subdistrict_name: "อ่าวนาง",
      postal_code: "81210",
      postal_code_detail: "ม.7 - 8",
    });
    await message("အတည်ပြု");
    await message("Test Customer\n09123456789");
    await message("အတည်ပြု");
    expect(database.rpc).toHaveBeenCalledWith(
      "place_cart_orders_from_messenger",
      expect.objectContaining({
        _township: "เมืองกระบี่",
        _address: "123/4 หมู่ 7, อ่าวนาง, กระบี่, 81210 (ม.7 - 8)",
      }),
    );
  });

  it("asks a new customer for their address when they skip it on the website", async () => {
    await message("CART_ORDER\n1. Test item — 2 ခု [111]");
    expect(session?.["state"]).toBe("cart_confirm");
    expect(session?.["data"]).not.toMatchObject({ township: expect.anything() });
    await message("အတည်ပြု");
    expect(session?.["state"]).toBe("ask_customer_details");
    const addressPrompt = String(sentMessages.at(-1)?.["text"] ?? "");
    expect(addressPrompt).toContain("အမည်");
    expect(addressPrompt).toContain("ဖုန်း");
    expect(addressPrompt).toContain("လိပ်စာ");

    const typedAddress = "123/4 หมู่ 5, ตำบลมหาชัย, จังหวัดสมุทรสาคร, 74000";
    await message(`ชื่อผู้รับ: New Customer\nเบอร์โทรศัพท์: 09123456789\nที่อยู่: ${typedAddress}`);
    expect(session?.["state"]).toBe("confirm");
    const confirmation = String(sentMessages.at(-1)?.["text"] ?? "");
    expect(confirmation).toContain("ชื่อผู้รับ: New Customer");
    expect(confirmation).toContain(`ที่อยู่: ${typedAddress}`);

    await message("အတည်ပြု");
    expect(database.rpc).toHaveBeenCalledWith(
      "place_cart_orders_from_messenger",
      expect.objectContaining({
        _name: "New Customer",
        _phone: "09123456789",
        _township: "",
        _address: typedAddress,
      }),
    );
  });

  it("offers a saved address to returning customers who skip website address entry", async () => {
    previousOrder = {
      owner_id: "owner-test",
      psid: "456",
      customer_name: "Returning Customer",
      phone: "08123456789",
      address: "123/4 หมู่ 5, ตำบลมหาชัย, จังหวัดสมุทรสาคร, 74000",
    };

    await message("CART_ORDER\n1. Test item — 2 ခု [111]");
    await message("အတည်ပြု");
    expect(session?.["state"]).toBe("reuse_customer_details");
    const reuseMessage = String(sentMessages.at(-1)?.["text"] ?? "");
    expect(reuseMessage).toContain("အရင်အော်ဒါ");
    expect(reuseMessage).toContain("ชื่อผู้รับ: Returning Customer");
    expect(reuseMessage).toContain("เบอร์โทรศัพท์: 08123456789");
    expect(reuseMessage).toContain("123/4 หมู่ 5");
    expect(sentMessages.at(-1)?.["quick_replies"]).toMatchObject([
      { title: "လိပ်စာအဟောင်းသုံးမည်", payload: "REUSE_CUSTOMER_DETAILS" },
      { title: "လိပ်စာအသစ်ထည့်မည်", payload: "ENTER_CUSTOMER_DETAILS" },
    ]);

    await message("REUSE_CUSTOMER_DETAILS");
    expect(session?.["state"]).toBe("confirm");
    expect(String(sentMessages.at(-1)?.["text"] ?? "")).toContain(
      "ที่อยู่: 123/4 หมู่ 5, ตำบลมหาชัย, จังหวัดสมุทรสาคร, 74000",
    );
    await message("အတည်ပြု");
    expect(database.rpc).toHaveBeenCalledWith(
      "place_cart_orders_from_messenger",
      expect.objectContaining({
        _name: "Returning Customer",
        _phone: "08123456789",
        _address: "123/4 หมู่ 5, ตำบลมหาชัย, จังหวัดสมุทรสาคร, 74000",
      }),
    );
  });

  it("reuses the separately saved customer profile when order history has been deleted", async () => {
    customerProfile = {
      owner_id: "owner-test",
      psid: "456",
      customer_name: "Profile Customer",
      phone: "08987654321",
      address: "123/4 หมู่ 5, ตำบลมหาชัย, อำเภอเมืองสมุทรสาคร, จังหวัดสมุทรสาคร, 74000",
      updated_at: "2026-11-12T00:00:00.000Z",
    };
    previousOrder = null;

    await message("CART_ORDER\n1. Test item — 2 ခု [111]");
    await message("အတည်ပြု");
    expect(session?.["state"]).toBe("reuse_customer_details");
    const reuseMessage = String(sentMessages.at(-1)?.["text"] ?? "");
    expect(reuseMessage).toContain("ชื่อผู้รับ: Profile Customer");
    expect(reuseMessage).toContain("เบอร์โทรศัพท์: 08987654321");
    expect(reuseMessage).toContain("123/4 หมู่ 5");

    await message("REUSE_CUSTOMER_DETAILS");
    await message("အတည်ပြု");
    expect(database.rpc).toHaveBeenCalledWith(
      "place_cart_orders_from_messenger",
      expect.objectContaining({
        _name: "Profile Customer",
        _phone: "08987654321",
        _address: "123/4 หมู่ 5, ตำบลมหาชัย, อำเภอเมืองสมุทรสาคร, จังหวัดสมุทรสาคร, 74000",
      }),
    );
  });

  it("falls back to the full address form when the province code is unknown", async () => {
    await message(
      "CART_ORDER\nADDR_PROVINCE: 999|xx|ไม่ทราบ\nADDR_DETAIL: 123 Sukhumvit\n1. Test item — 2 ခု [111]",
    );
    expect(session?.["state"]).toBe("cart_confirm");
    await message("အတည်ပြု");
    expect(session?.["state"]).toBe("ask_customer_details");
  });

  it("re-asks for name and phone instead of creating an order with an invalid contact", async () => {
    await message(cartWithAddress);
    await message("အတည်ပြု");
    await message("only a name");
    expect(session?.["state"]).toBe("ask_name_phone");
    expect(database.rpc).not.toHaveBeenCalledWith(
      "place_cart_orders_from_messenger",
      expect.anything(),
    );
  });

  it("uses Burmese edit controls with Thai contact and address labels", async () => {
    await message(cartWithAddress);
    await message("အတည်ပြု");
    await message("Test Customer\n09123456789");
    expect(sentMessages.at(-1)?.["quick_replies"]).toMatchObject([
      { title: "အတည်ပြု", payload: "YES" },
      { title: "ပြင်မည်", payload: "NO" },
    ]);

    await message("ပြင်မည်");
    expect(session?.["state"]).toBe("ask_customer_details");
    const editPrompt = String(sentMessages.at(-1)?.["text"] ?? "");
    expect(editPrompt).toContain("အမည်");
    expect(editPrompt).toContain("ဖုန်း");
    expect(editPrompt).toContain("လိပ်စာ");
    expect(editPrompt).toContain("ชื่อผู้รับ:");
    expect(editPrompt).toContain("เบอร์โทรศัพท์:");
    expect(editPrompt).toContain("ที่อยู่:");
  });
});
