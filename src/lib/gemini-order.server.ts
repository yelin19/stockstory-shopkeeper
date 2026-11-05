type ProductCandidate = {
  code: string;
  name: string;
  category?: string | null;
  unit?: string | null;
};

type GeminiOrderIntent = {
  code: string;
  quantity: number;
};

const apiKey = () => process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;

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

  try {
    const response = await fetch("https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent", {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0, responseMimeType: "application/json" },
      }),
    });
    if (!response.ok) return null;
    const body = await response.json() as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
    const text = body.candidates?.[0]?.content?.parts?.[0]?.text;
    const parsed = parseJson(text ?? "") as { code?: unknown; quantity?: unknown } | null;
    if (!parsed || typeof parsed.code !== "string" || !Number.isInteger(parsed.quantity) || Number(parsed.quantity) < 1) return null;
    const code = parsed.code.trim();
    const product = products.find((item) => item.code.trim().toLowerCase() === code.toLowerCase());
    if (!product) return null;
    return { code: product.code, quantity: Number(parsed.quantity) };
  } catch {
    return null;
  }
}
