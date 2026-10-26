import { describe, expect, it, vi } from "vitest";
import { extractCustomerDetailsFromImageUrl } from "@/lib/customer-details-image.server";

const imageUrl = "https://scontent.xx.fbcdn.net/customer-card.jpg";
const details = {
  name: "မောင်မောင်",
  phone: "၀၉ ၁၂၃၄၅၆၇၈၉",
  address: "အမှတ် ၁၂၊ ရန်ကုန်မြို့",
};

function imageResponse(
  contentType = "image/jpeg",
  body = Uint8Array.from([1, 2, 3]),
  headers: Record<string, string> = {},
) {
  return new Response(body, { headers: { "content-type": contentType, ...headers } });
}

function geminiResponse(value: unknown) {
  const chunk = JSON.stringify({ choices: [{ delta: { content: JSON.stringify(value) } }] });
  return new Response(`data: ${chunk}\n\ndata: [DONE]\n\n`, {
    headers: { "content-type": "text/event-stream" },
  });
}

describe("extractCustomerDetailsFromImageUrl", () => {
  it("downloads a Messenger image, requests structured Gemini JSON, and converts Burmese phone digits", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(imageResponse())
      .mockResolvedValueOnce(geminiResponse(details));

    const result = await extractCustomerDetailsFromImageUrl(imageUrl, {
      apiKey: "test-secret",
      fetcher,
    });

    expect(result).toEqual({
      ok: true,
      details: { name: "မောင်မောင်", phone: "09 123456789", address: "အမှတ် ၁၂၊ ရန်ကုန်မြို့" },
    });
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(String(fetcher.mock.calls[1]?.[0])).toBe("https://ai.gateway.lovable.dev/v1/chat/completions");
    const request = fetcher.mock.calls[1]?.[1] as RequestInit;
    expect(new Headers(request.headers).get("Lovable-API-Key")).toBe("test-secret");
    const body = JSON.parse(String(request.body));
    expect(body.model).toBe("google/gemini-3.8-flash");
    expect(body.messages[0].content[0].image_url.url).toBe("data:image/jpeg;base64,AQID");
    expect(body.response_format.type).toBe("json_schema");
  });

  it("does not call external services without an AI key", async () => {
    const fetcher = vi.fn<typeof fetch>();
    await expect(
      extractCustomerDetailsFromImageUrl(imageUrl, { apiKey: "", fetcher }),
    ).resolves.toEqual({
      ok: false,
      reason: "missing_key",
    });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("classifies Lovable AI rate limits without logging private details", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(imageResponse())
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: { type: "rate_limited", message: "private detail" } }), {
          status: 429,
        }),
      );
    const logError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      await expect(
        extractCustomerDetailsFromImageUrl(imageUrl, { apiKey: "test-secret", fetcher }),
      ).resolves.toEqual({ ok: false, reason: "rate_limited" });
      expect(JSON.stringify(logError.mock.calls)).not.toContain("private detail");
      expect(JSON.stringify(logError.mock.calls)).not.toContain("test-secret");
    } finally {
      logError.mockRestore();
    }
  });

  it("rejects non-Meta image URLs before fetching", async () => {
    const fetcher = vi.fn<typeof fetch>();
    await expect(
      extractCustomerDetailsFromImageUrl("https://example.com/photo.jpg", {
        apiKey: "test-secret",
        fetcher,
      }),
    ).resolves.toEqual({
      ok: false,
      reason: "invalid_url",
    });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("rejects unsupported or oversized images before calling Gemini", async () => {
    const unsupportedFetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(imageResponse("image/gif"));
    await expect(
      extractCustomerDetailsFromImageUrl(imageUrl, {
        apiKey: "test-secret",
        fetcher: unsupportedFetcher,
      }),
    ).resolves.toEqual({
      ok: false,
      reason: "image_unavailable",
    });
    expect(unsupportedFetcher).toHaveBeenCalledTimes(1);

    const oversizedFetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(
      imageResponse("image/jpeg", new Uint8Array(), {
        "content-length": String(6 * 1024 * 1024),
      }),
    );
    await expect(
      extractCustomerDetailsFromImageUrl(imageUrl, {
        apiKey: "test-secret",
        fetcher: oversizedFetcher,
      }),
    ).resolves.toEqual({
      ok: false,
      reason: "image_unavailable",
    });
    expect(oversizedFetcher).toHaveBeenCalledTimes(1);
  });

  it("rejects missing or invalid extracted details instead of guessing", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(imageResponse())
      .mockResolvedValueOnce(geminiResponse({ name: "မောင်မောင်", phone: "", address: "ရန်ကုန်" }));
    await expect(
      extractCustomerDetailsFromImageUrl(imageUrl, { apiKey: "test-secret", fetcher }),
    ).resolves.toEqual({
      ok: false,
      reason: "unreadable",
    });
  });
});
