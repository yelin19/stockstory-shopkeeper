// Parses a customer message like "111", "111 2", "111=2" into code + quantity.
export function parseProductRequest(text: string): { code: string; qty: number | null } | null {
  const m = text.trim().match(/^([A-Za-z0-9_-]{1,32})\s*(?:(?:=|\s|x|×|\*)\s*(\d{1,4}))?$/i);
  if (!m) return null;
  const qty = m[2] ? parseInt(m[2], 10) : null;
  if (qty !== null && qty <= 0) return null;
  return { code: m[1], qty };
}

export function usernameToEmail(username: string) {
  const u = username.trim().toLowerCase().replace(/[^a-z0-9._-]/g, "");
  return `${u}@shop-admin.local`;
}

export function isYes(t: string) {
  return /^(y|yes|ok|confirm|ဟုတ်|ဟုတ်ကဲ့)$/i.test(t.trim());
}
export function isNo(t: string) {
  return /^(n|no|cancel|မလုပ်|မဟုတ်)$/i.test(t.trim());
}
