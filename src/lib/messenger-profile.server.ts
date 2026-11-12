export function normalizeMessengerDisplayName(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const name = [...value]
    .map((character) => {
      const code = character.codePointAt(0) ?? 0;
      return code < 32 || code === 127 ? " " : character;
    })
    .join("")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
  return name || null;
}

export async function fetchMessengerProfileName(
  psid: string,
  pageAccessToken: string,
  fetcher: typeof fetch = fetch,
): Promise<string | null> {
  const safePsid = psid.trim();
  const token = pageAccessToken.trim();
  if (!/^\d{1,32}$/.test(safePsid) || !token) return null;

  const url = new URL(`https://graph.facebook.com/${encodeURIComponent(safePsid)}`);
  url.searchParams.set("fields", "first_name,last_name,name");
  url.searchParams.set("access_token", token);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 1500);

  try {
    const response = await fetcher(url.toString(), { signal: controller.signal });
    if (!response.ok) return null;
    const profile = (await response.json()) as {
      first_name?: unknown;
      last_name?: unknown;
      name?: unknown;
    };
    const firstName = normalizeMessengerDisplayName(profile.first_name);
    const lastName = normalizeMessengerDisplayName(profile.last_name);
    return (
      normalizeMessengerDisplayName([firstName, lastName].filter(Boolean).join(" ")) ??
      normalizeMessengerDisplayName(profile.name)
    );
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

export function personalizeMessengerReply(message: string, customerName: string | null): string {
  const name = normalizeMessengerDisplayName(customerName);
  if (!name || !message.trim()) return message;
  const trimmed = message.trim();
  if (trimmed.startsWith(`${name} ရေ`)) return message;

  const greeting = /^(?:မင်္ဂလာပါ|မဂ်လာပါ|ဟယ်လို|hello|hi)(?:\s*ရှင်)?[\s၊,!.။]*/iu;
  const withoutGreeting = trimmed.replace(greeting, "").trim();
  if (withoutGreeting !== trimmed) {
    return `မင်္ဂလာပါ ${name} ရေ။${withoutGreeting ? ` ${withoutGreeting}` : ""}`;
  }
  return `${name} ရေ၊ ${trimmed}`;
}
