import { createFileRoute } from "@tanstack/react-router";
import { ordersQuery } from "@/lib/shop-data";
import { OrdersView } from "@/components/OrdersView";

export const Route = createFileRoute("/_authenticated/admin/orders")({
  loader: ({ context }) => context.queryClient.ensureQueryData(ordersQuery),
  component: () => <OrdersView mode="orders" />,
});
