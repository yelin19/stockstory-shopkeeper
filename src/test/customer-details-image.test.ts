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
  return new Response(
    JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(value) }] } }] }),
    {
      headers: { "content-type": "application/json" },
    },
  );
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
    expect(String(fetcher.mock.calls[1]?.[0])).toContain("models/gemini-3.8-flash:generateContent");
    const request = fetcher.mock.calls[1]?.[1] as RequestInit;
    expect(new Headers(request.headers).get("x-goog-api-key")).toBe("test-secret");
    const body = JSON.parse(String(request.body));
    expect(body.contents[0].parts[0].inlineData).toEqual({ mimeType: "image/jpeg", data: "AQID" });
    expect(body.generationConfig.responseFormat.text.mimeType).toBe("application/json");
  });

  it("does not call external services without a Gemini key", async () => {
    const fetcher = vi.fn<typeof fetch>();
    await expect(
      extractCustomerDetailsFromImageUrl(imageUrl, { apiKey: "", fetcher }),
    ).resolves.toEqual({
      ok: false,
      reason: "missing_key",
    });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("classifies Gemini free-tier quota errors and logs only safe status metadata", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(imageResponse())
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            error: { code: 429, status: "RESOURCE_EXHAUSTED", message: "private detail" },
          }),
          { status: 429, headers: { "content-type": "application/json" } },
        ),
      );
    const logError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      await expect(
        extractCustomerDetailsFromImageUrl(imageUrl, { apiKey: "test-secret", fetcher }),
      ).resolves.toEqual({ ok: false, reason: "rate_limited" });
      expect(logError).toHaveBeenCalledWith(
        "Gemini customer-details API error",
        JSON.stringify({
          httpStatus: 429,
          providerStatus: "RESOURCE_EXHAUSTED",
          providerCode: 429,
          providerReason: "UNKNOWN",
        }),
      );
      expect(JSON.stringify(logError.mock.calls)).not.toContain("private detail");
      expect(JSON.stringify(logError.mock.calls)).not.toContain("test-secret");
    } finally {
      logError.mockRestore();
    }
  });

  it("recognizes a 400 API_KEY_INVALID reason without logging the provider message", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(imageResponse())
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            error: {
              code: 400,
              status: "INVALID_ARGUMENT",
              message: "API key not valid. Please pass a valid API key.",
              details: [
                {
                  "@type": "type.googleapis.com/google.rpc.ErrorInfo",
                  reason: "API_KEY_INVALID",
                  domain: "googleapis.com",
                },
              ],
            },
          }),
          { status: 400, headers: { "content-type": "application/json" } },
        ),
      );
    const logError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      await expect(
        extractCustomerDetailsFromImageUrl(imageUrl, { apiKey: "test-secret", fetcher }),
      ).resolves.toEqual({ ok: false, reason: "api_key_rejected" });
      expect(logError).toHaveBeenCalledWith(
        "Gemini customer-details API error",
        JSON.stringify({
          httpStatus: 400,
          providerStatus: "INVALID_ARGUMENT",
          providerCode: 400,
          providerReason: "API_KEY_INVALID",
        }),
      );
      expect(JSON.stringify(logError.mock.calls)).not.toContain("API key not valid");
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
