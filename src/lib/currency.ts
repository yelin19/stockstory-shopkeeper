export type ShopCurrency = "MMK" | "THB";

export function normalizeCurrency(currency?: string | null): ShopCurrency {
  return currency === "THB" ? "THB" : "MMK";
}

export function formatCurrency(amount: number | string, currency?: string | null) {
  const value = Number(amount).toLocaleString("en-US", { maximumFractionDigits: 2 });
  return `${value} ${normalizeCurrency(currency) === "THB" ? "฿" : "Ks"}`;
}

export function sumByCurrency(
  rows: readonly { total: number | string; currency?: string | null }[],
  fallbackCurrency?: string | null,
) {
  const totals = new Map<ShopCurrency, number>();
  for (const row of rows) {
    const currency = normalizeCurrency(row.currency ?? fallbackCurrency);
    totals.set(currency, (totals.get(currency) ?? 0) + Number(row.total));
  }
  if (totals.size === 0) return formatCurrency(0, fallbackCurrency);
  return [...totals.entries()].map(([currency, total]) => formatCurrency(total, currency)).join(" · ");
}
