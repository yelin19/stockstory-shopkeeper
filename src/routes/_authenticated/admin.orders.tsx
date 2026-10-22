import { createFileRoute } from "@tanstack/react-router";
import { ordersQuery } from "@/lib/shop-data";
import { OrdersView } from "@/components/OrdersView";

export const Route = createFileRoute("/_authenticated/admin/orders")({
  head: () => ({ meta: [
    { title: "Shop Orders — Messenger Shop" },
    { name: "description", content: "Manage confirmed Messenger shop orders and deliveries." },
    { property: "og:title", content: "Shop Orders — Messenger Shop" },
    { property: "og:description", content: "Manage confirmed Messenger shop orders and deliveries." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary_large_image" },
    { name: "robots", content: "noindex" },
  ] }),
  loader: ({ context }) => context.queryClient.ensureQueryData(ordersQuery),
  component: () => <OrdersView mode="orders" />,
});
