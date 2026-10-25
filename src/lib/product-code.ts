export function normalizeProductCode(code: string) {
  return code.trim().normalize("NFC");
}

export function isValidProductCode(code: string) {
  return /^[\p{L}\p{M}\p{N}_-]{1,32}$/u.test(code);
}
