import { describe, expect, it, vi } from "vitest";
import {
  fetchMessengerProfileName,
  normalizeMessengerDisplayName,
  personalizeMessengerReply,
} from "@/lib/messenger-profile.server";

describe("Messenger profile names", () => {
  it("reads first and last name through the Page-scoped profile endpoint", async () => {
    const fetcher = vi.fn(
      async () => new Response(JSON.stringify({ first_name: "Aye", last_name: "Aye" })),
    );

    await expect(fetchMessengerProfileName("456", "page-token", fetcher)).resolves.toBe("Aye Aye");
    expect(fetcher).toHaveBeenCalledOnce();
    const [url] = fetcher.mock.calls[0] ?? [];
    expect(String(url)).toContain("/456?");
    expect(String(url)).toContain("fields=first_name%2Clast_name%2Cname");
  });

  it("uses the profile name fallback and gracefully handles unavailable profiles", async () => {
    const profileNameFetch = vi.fn(async () => new Response(JSON.stringify({ name: "May Lay" })));
    await expect(fetchMessengerProfileName("456", "page-token", profileNameFetch)).resolves.toBe(
      "May Lay",
    );

    const unavailableFetch = vi.fn(async () => new Response("{}", { status: 403 }));
    await expect(
      fetchMessengerProfileName("456", "page-token", unavailableFetch),
    ).resolves.toBeNull();
  });

  it("does not call Facebook without a valid PSID and Page token", async () => {
    const fetcher = vi.fn();
    await expect(
      fetchMessengerProfileName("not-a-psid", "page-token", fetcher),
    ).resolves.toBeNull();
    await expect(fetchMessengerProfileName("456", "", fetcher)).resolves.toBeNull();
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("sanitizes names and personalizes both greetings and ordinary replies", () => {
    expect(normalizeMessengerDisplayName("  Aye\nAye  ")).toBe("Aye Aye");
    expect(personalizeMessengerReply("မင်္ဂလာပါရှင်။ ဘာကူညီပေးရမလဲရှင်။", "Aye Aye")).toBe(
      "မင်္ဂလာပါ Aye Aye ရေ။ ဘာကူညီပေးရမလဲရှင်။",
    );
    expect(personalizeMessengerReply("ပစ္စည်းရှိပါတယ်ရှင်။", "Aye Aye")).toBe(
      "Aye Aye ရေ၊ ပစ္စည်းရှိပါတယ်ရှင်။",
    );
    expect(personalizeMessengerReply("မင်္ဂလာပါရှင်။", null)).toBe("မင်္ဂလာပါရှင်။");
  });
});
