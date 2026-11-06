type ProductCandidate = {
  code: string;
  name: string;
  category?: string | null;
  unit?: string | null;
  price?: number | null;
  stock?: number | null;
  description?: string | null;
};

type GeminiOrderIntent = {
  code: string;
  quantity: number;
};

const apiKey = () => process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
const modelUrl = () => "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent";

function parseJson(text: string): unknown {
  const cleaned = text.trim().replace(/^```json\s*/i, "").replace(/```$/i, "").trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      return JSON.parse(match[0]);
    } catch {
      return null;
    }
  }
}

async function generate(prompt: string): Promise<string | null> {
  const key = apiKey();
  if (!key) return null;
  try {
    const response = await fetch(modelUrl(), {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.7, maxOutputTokens: 800, thinkingConfig: { thinkingBudget: 0 } },
      }),
    });
    if (!response.ok) {
      console.error("Gemini reply request failed", response.status, (await response.text().catch(() => "")).slice(0, 200));
      return null;
    }
    const body = await response.json() as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
    const text = body.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
    return text || null;
  } catch {
    return null;
  }
}

export async function understandOrderMessage(
  message: string,
  products: ProductCandidate[],
): Promise<GeminiOrderIntent | null> {
  const key = apiKey();
  if (!key || !message.trim() || !products.length) return null;

  const catalog = products.slice(0, 150).map((product) => ({
    code: product.code,
    name: product.name,
    category: product.category ?? "",
    unit: product.unit ?? "",
  }));

  const prompt = [
    "You are a product-order intent extractor for a Burmese Facebook Messenger shop.",
    "Return JSON only. Never invent a product code. Select only an exact code from the catalog.",
    "If the customer is not clearly trying to order a product, return {\"code\":null,\"quantity\":null}.",
    "Understand Burmese and simple Thai/English shopping phrases.",
    "Quantity must be a positive integer. If quantity is not stated, use 1 only when the customer clearly wants to buy/order.",
    `Catalog: ${JSON.stringify(catalog)}`,
    `Customer message: ${JSON.stringify(message)}`,
    "Output schema: {\"code\": string|null, \"quantity\": number|null}",
  ].join("\n");

  const text = await generate(prompt);
  const parsed = parseJson(text ?? "") as { code?: unknown; quantity?: unknown } | null;
  if (!parsed || typeof parsed.code !== "string" || !Number.isInteger(parsed.quantity) || Number(parsed.quantity) < 1) return null;
  const code = parsed.code.trim();
  const product = products.find((item) => item.code.trim().toLowerCase() === code.toLowerCase());
  if (!product) return null;
  return { code: product.code, quantity: Number(parsed.quantity) };
}

export type CustomerOrderFact = {
  public_order_id: string;
  product_name: string;
  quantity: number;
  total: number;
  status: string;
  payment_status: string;
  delivery_status: string;
  tracking_number: string | null;
  tracking_url: string | null;
  created_at: string;
};

export async function generateNaturalShopReply(
  message: string,
  products: ProductCandidate[],
  orders: CustomerOrderFact[] = [],
  history: Array<{ role: "customer" | "shop"; text: string }> = [],
): Promise<string | null> {
  if (!apiKey() || !message.trim()) return null;
  const catalog = products.slice(0, 80).map((product) => ({
    code: product.code,
    name: product.name,
    category: product.category ?? "",
    unit: product.unit ?? "",
    price: product.price ?? null,
    stock: product.stock ?? null,
    description: product.description ? String(product.description).slice(0, 200) : "",
  }));
  const prompt = [
    "You are the friendly Burmese-speaking owner of a small Facebook shop, chatting with one customer in Messenger.",
    "Sound like a real human shop owner: warm, attentive, natural, and conversational. Never sound like a bot, automated menu, FAQ, or code validator.",
    "Reply only in natural Burmese unless the customer clearly asks for another language. Use polite particles such as ရှင် naturally, but do not add ရှင် to every sentence.",
    "Read the customer's exact intent before replying. Answer the question first, then ask one short helpful follow-up only when needed.",
    "Keep the reply short: normally 1 to 4 natural Messenger lines. Do not use headings, JSON, markdown tables, long explanations, or unnecessary emojis.",
    "Understand casual Burmese, typos, colloquial wording, greetings, availability questions, price questions, delivery questions, and general conversation.",
    "Examples: 'ဖိနပ်ရှိလား' means check whether shoes are available; 'ဖုန်းရောင်းလား' means ask whether phones are sold; 'ဈေးဘယ်လောက်လဲ' means ask the price; these are questions, not product codes.",
    "For a product question, use only the catalog facts below. Mention the matching product name, price, and stock when available, then naturally offer the product code if the customer wants to order.",
    "If no matching product is in the catalog, say you cannot find that item in the current shop list and ask for the product name or code. Never guess or invent a product.",
    "For greetings or casual conversation, respond naturally first (for example, greet them back or answer briefly), then gently mention that you can help check products if appropriate.",
    "For general questions unrelated to products, answer helpfully and briefly. If the question is unclear, ask a natural clarification instead of replying with a product-code instruction.",
    "If the customer clearly wants to buy, do not claim that an order has been placed. Ask for the product code and quantity so the shop's order flow can continue.",
    "Never invent prices, stock, delivery dates, payment status, order status, customer details, or promises. Never say you checked something that is not present in the catalog facts.",
    "If the customer asks about their order (status, payment, delivery, tracking), answer using ONLY the 'Customer's own orders' facts below: order ID, item, total, payment status, delivery status, and tracking number/link if present. If there are no orders listed, say you cannot find an order from this Messenger account and ask for the order ID.",
    "Sell like a helpful human salesperson: recommend matching in-stock items, mention benefits from the product description, and gently invite the customer to order by sending the product code and quantity (for example: CODE 2). Never pressure.",
    "Do not repeat the same phrase mechanically. Do not begin every reply with 'ဟုတ်ကဲ့ရှင်'. Do not tell the customer to send a code unless the customer is actually asking to buy or the product code is needed to continue an order.",
    `Catalog facts: ${JSON.stringify(catalog)}`,
    `Customer's own orders (newest first): ${JSON.stringify(orders.slice(0, 5))}`,
    `Recent conversation: ${JSON.stringify(history.slice(-8))}`,
    `Customer message: ${JSON.stringify(message)}`,
  ].join("\n");
  return generate(prompt);
}
