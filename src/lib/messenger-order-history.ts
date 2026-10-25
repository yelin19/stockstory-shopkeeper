import { formatQuantity } from "@/lib/product-unit";

export type ReturnedOrderSummary = {
  public_order_id: string;
  product_name: string;
  product_unit: string;
  quantity: number;
  created_at: string;
};

export function formatReturnedOrderHistory(order: ReturnedOrderSummary) {
  return `Order ID: ${order.public_order_id}\nရက်စွဲ: ${new Date(order.created_at).toLocaleDateString("en-GB")}\nပစ္စည်းအမည်: ${order.product_name}\nအရေအတွက်: ${formatQuantity(order.quantity, order.product_unit)}`;
}
