import type { Order } from "@/lib/shop-data";
import { findThaiProvince } from "@/lib/thai-provinces";
import { formatQuantity } from "@/lib/product-unit";

type CartItemSummary = { product: string; qty: number; unit: string; price: number };

function cartItemsFromNote(note: string | null | undefined): CartItemSummary[] {
  const marker = "CART_ITEMS:";
  if (!note?.startsWith(marker)) return [];
  try {
    const value = JSON.parse(note.slice(marker.length)) as unknown;
    if (!Array.isArray(value)) return [];
    return value.filter((item): item is CartItemSummary => {
      const row = item as Partial<CartItemSummary>;
      return (
        typeof row.product === "string" &&
        typeof row.unit === "string" &&
        Number.isFinite(Number(row.qty)) &&
        Number.isFinite(Number(row.price))
      );
    });
  } catch {
    return [];
  }
}

function normalizedPart(value: string) {
  return value
    .trim()
    .replace(/^(?:จังหวัด|อำเภอ|เขต|ตำบล|แขวง)\s*/u, "")
    .replace(/\s+/g, " ")
    .toLocaleLowerCase();
}

function splitAddress(value: string) {
  return value
    .split(/[,،၊\n]+/u)
    .map((part) => part.trim())
    .filter(Boolean);
}

/** Formats legacy order fields into Thai delivery order and removes duplicated province text. */
export function formatRecipientAddress(
  township: string | null | undefined,
  address: string | null | undefined,
) {
  const townshipValue = township?.trim() ?? "";
  const parts = splitAddress(address ?? "");
  if (!parts.length) return townshipValue;

  const provinceIndex = parts.findIndex((part) =>
    findThaiProvince(part.replace(/^จังหวัด\s*/u, "")),
  );
  const province =
    provinceIndex >= 0
      ? findThaiProvince(parts[provinceIndex]?.replace(/^จังหวัด\s*/u, ""))
      : findThaiProvince(townshipValue);
  if (!province) {
    const seen = new Set<string>();
    return [townshipValue, ...parts]
      .filter((part) => {
        const key = normalizedPart(part);
        if (!key || seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .join(", ");
  }

  const postalIndex = parts.findIndex((part) => /^\d{5}(?:\s*\([^)]*\))?$/u.test(part));
  const explicitDistrict = parts.find((part) => /^(?:อำเภอ|เขต)\s*/u.test(part));
  const explicitSubdistrict = parts.find((part) => /^(?:ตำบล|แขวง)\s*/u.test(part));
  const rawTownshipIsProvince = Boolean(findThaiProvince(townshipValue));
  const district =
    explicitDistrict?.replace(/^(?:อำเภอ|เขต)\s*/u, "").trim() ||
    (!rawTownshipIsProvince ? townshipValue : "");

  const endBeforeProvince = provinceIndex >= 0 ? provinceIndex : parts.length;
  const precedingParts = parts.slice(0, endBeforeProvince);
  const unlabelledParts = precedingParts.filter(
    (part) => !/^(?:จังหวัด|อำเภอ|เขต|ตำบล|แขวง)\s*/u.test(part),
  );
  const inferredSubdistrict =
    !explicitSubdistrict && unlabelledParts.length >= 2 ? unlabelledParts.at(-1) : undefined;
  const subdistrict =
    explicitSubdistrict?.replace(/^(?:ตำบล|แขวง)\s*/u, "").trim() || inferredSubdistrict || "";
  const excluded = new Set<string>([
    normalizedPart(parts[provinceIndex] ?? ""),
    ...(postalIndex >= 0 ? [normalizedPart(parts[postalIndex] ?? "")] : []),
    ...(explicitDistrict ? [normalizedPart(explicitDistrict)] : []),
    ...(explicitSubdistrict ? [normalizedPart(explicitSubdistrict)] : []),
    ...(inferredSubdistrict ? [normalizedPart(inferredSubdistrict)] : []),
  ]);
  if (!rawTownshipIsProvince && townshipValue && district)
    excluded.add(normalizedPart(townshipValue));
  const detailParts = parts.filter((part) => !excluded.has(normalizedPart(part)));
  const administrativeDistrict = district
    ? `${province.code === "10" ? "เขต" : "อำเภอ"}${district}`
    : "";
  const administrativeSubdistrict = subdistrict
    ? `${province.code === "10" ? "แขวง" : "ตำบล"}${subdistrict}`
    : "";
  const provinceText = province.code === "10" ? province.name : `จังหวัด${province.name}`;
  const postalCode = postalIndex >= 0 ? parts[postalIndex] : "";
  const normalized = [
    ...detailParts,
    administrativeSubdistrict,
    administrativeDistrict,
    provinceText,
    postalCode,
  ].filter(Boolean);
  const seen = new Set<string>();
  return normalized
    .filter((part) => {
      const key = normalizedPart(part);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .join(", ");
}

export type PrintableOrder = Order & {
  print_total: number;
  print_products: string[];
};

/**
 * Resolve selected customer-facing order IDs and combine every database product
 * row for each ID into one printable label.
 */
export function selectedOrdersForPrint(
  allOrders: Order[],
  visibleOrders: Order[],
  selectedPublicOrderIds: string[],
): PrintableOrder[] {
  const selectedIds = new Set(selectedPublicOrderIds);
  const selectedPublicIds = new Set(
    visibleOrders
      .filter((order) => selectedIds.has(order.public_order_id) && order.status !== "cancelled")
      .map((order) => order.public_order_id),
  );
  if (!selectedPublicIds.size) return [];

  const groups = new Map<string, Order[]>();
  for (const order of allOrders) {
    if (order.status === "cancelled" || !selectedPublicIds.has(order.public_order_id)) continue;
    groups.set(order.public_order_id, [...(groups.get(order.public_order_id) ?? []), order]);
  }

  return [...groups.values()].map((group) => {
    const first = group[0]!;
    const items =
      group.map((order) => cartItemsFromNote(order.note)).find((value) => value.length) ?? [];
    const products = items.length
      ? items.map((item) => `ပစ္စည်း: ${item.product} · ${formatQuantity(item.qty, item.unit)}`)
      : group.map(
          (order) =>
            `ပစ္စည်း: ${order.product_name} · ${formatQuantity(order.quantity, order.product_unit)}`,
        );
    return {
      ...first,
      print_total: group.reduce((sum, order) => sum + Number(order.total), 0),
      print_products: products,
    };
  });
}
