type ProductCandidate = {
  code: string;
  name: string;
  category?: string | null;
  unit?: string | null;
  price?: number | null;
  stock?: number | null;
};

type GeminiOrderIntent = {
  code: string;
  quantity: number;
};

const apiKey = () => process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
const modelUrl = () => "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent";

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
        generationConfig: { temperature: 0.65, maxOutputTokens: 180 },
      }),
    });
    if (!response.ok) return null;
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

export async function generateNaturalShopReply(
  message: string,
  products: ProductCandidate[],
): Promise<string | null> {
  if (!apiKey() || !message.trim()) return null;
  const catalog = products.slice(0, 80).map((product) => ({
    code: product.code,
    name: product.name,
    category: product.category ?? "",
    unit: product.unit ?? "",
    price: product.price ?? null,
    stock: product.stock ?? null,
  }));
  const prompt = [
    "You are a warm Burmese shop assistant chatting naturally with a customer on Facebook Messenger.",
    "Reply in natural, polite Burmese like a real shop owner, not like a robot or a form.",
    "Be concise: 1 to 4 short lines. Use a friendly tone and natural particles such as ရှင် when appropriate.",
    "Do not claim an order is placed, do not invent products, prices, stock, delivery promises, or customer details.",
    "If the customer is greeting or asking generally, answer warmly and invite them to ask about a product.",
    "If they ask about a catalog product, use only the catalog facts below and invite them to order with its code.",
    "If they are clearly trying to order, do not place it here; ask them to send the product code and quantity.",
    `Catalog facts: ${JSON.stringify(catalog)}`,
    `Customer message: ${JSON.stringify(message)}`,
  ].join("\n");
  return generate(prompt);
}
