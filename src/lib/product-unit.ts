export function normalizeProductUnit(unit?: string | null) {
  return unit?.trim().normalize("NFC") || "ခု";
}

export function isValidProductUnit(unit: string) {
  const normalized = unit.trim().normalize("NFC");
  return normalized.length > 0 && Array.from(normalized).length <= 32 && !/[\r\n]/.test(normalized);
}

export function formatQuantity(quantity: number, unit?: string | null) {
  return `${quantity}${normalizeProductUnit(unit)}`;
}
