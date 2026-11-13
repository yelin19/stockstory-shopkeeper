const REFERRAL_PREFIX = "webcart1_";
const MAX_REFERRAL_LENGTH = 2083;

type CartReferralData = {
  items: Array<{ code: string; qty: number }>;
  addressLines: string[];
};

function toBase64Url(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function fromBase64Url(value: string): string | null {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) return null;
  try {
    const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
    const binary = atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, "="));
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return null;
  }
}

export function createMessengerCartReferral(
  items: CartReferralData["items"],
  addressLines: string[],
): string | null {
  if (items.length < 1 || items.length > 50 || addressLines.length > 4) return null;
  if (
    items.some(
      ({ code, qty }) =>
        !code.trim() || code.length > 100 || !Number.isInteger(qty) || qty < 1 || qty > 9999,
    ) ||
    addressLines.some((line) => typeof line !== "string" || line.length > 600)
  )
    return null;

  const value = toBase64Url(
    JSON.stringify({
      v: 1,
      i: items.map(({ code, qty }) => [code.trim(), qty]),
      a: addressLines,
    }),
  );
  const referral = `${REFERRAL_PREFIX}${value}`;
  return referral.length <= MAX_REFERRAL_LENGTH ? referral : null;
}

export function decodeMessengerCartReferral(referral: unknown): CartReferralData | null {
  if (
    typeof referral !== "string" ||
    referral.length > MAX_REFERRAL_LENGTH ||
    !referral.startsWith(REFERRAL_PREFIX)
  )
    return null;

  const decoded = fromBase64Url(referral.slice(REFERRAL_PREFIX.length));
  if (!decoded) return null;
  try {
    const value = JSON.parse(decoded) as {
      v?: unknown;
      i?: unknown;
      a?: unknown;
    };
    if (value.v !== 1 || !Array.isArray(value.i) || !Array.isArray(value.a)) return null;
    if (value.i.length < 1 || value.i.length > 50 || value.a.length > 4) return null;

    const items: CartReferralData["items"] = [];
    for (const item of value.i) {
      if (!Array.isArray(item) || item.length !== 2) return null;
      const [rawCode, rawQty] = item;
      if (
        typeof rawCode !== "string" ||
        !rawCode.trim() ||
        rawCode.length > 100 ||
        typeof rawQty !== "number" ||
        !Number.isInteger(rawQty) ||
        rawQty < 1 ||
        rawQty > 9999
      )
        return null;
      items.push({ code: rawCode.trim(), qty: rawQty });
    }

    if (value.a.some((line) => typeof line !== "string" || line.length > 600)) return null;
    return { items, addressLines: value.a as string[] };
  } catch {
    return null;
  }
}
