export type PublicOrderRef = { public_order_id: string };

export function uniquePublicOrderIds(orders: readonly PublicOrderRef[]) {
  return [...new Set(orders.map((order) => order.public_order_id))];
}

export function togglePublicOrderSelection(selectedIds: readonly string[], publicOrderId: string) {
  const selected = new Set(selectedIds);
  if (selected.has(publicOrderId)) selected.delete(publicOrderId);
  else selected.add(publicOrderId);
  return [...selected];
}

export function toggleAllPublicOrders(
  selectedIds: readonly string[],
  publicOrderIds: readonly string[],
) {
  const selected = new Set(selectedIds);
  const allVisibleSelected =
    publicOrderIds.length > 0 && publicOrderIds.every((id) => selected.has(id));

  for (const id of publicOrderIds) {
    if (allVisibleSelected) selected.delete(id);
    else selected.add(id);
  }

  return [...selected];
}
