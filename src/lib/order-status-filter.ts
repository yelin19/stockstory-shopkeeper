export type OrderStatusFilter = "all" | "cancelled";

export function matchesOrderStatus(status: string, filter: OrderStatusFilter) {
  return filter === "all" || status === "cancelled";
}
