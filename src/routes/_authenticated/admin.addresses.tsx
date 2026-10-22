import { createFileRoute } from "@tanstack/react-router";
import { ordersQuery } from "@/lib/shop-data";
import { OrdersView } from "@/components/OrdersView";

export const Route = createFileRoute("/_authenticated/admin/addresses")({
  head: () => ({ meta: [
    { title: "Delivery Addresses — Messenger Shop" },
    { name: "description", content: "Manage delivery addresses for Messenger shop orders." },
    { property: "og:title", content: "Delivery Addresses — Messenger Shop" },
    { property: "og:description", content: "Manage delivery addresses for Messenger shop orders." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary_large_image" },
    { name: "robots", content: "noindex" },
  ] }),
  loader: ({ context }) => context.queryClient.ensureQueryData(ordersQuery),
  component: () => <OrdersView mode="addresses" />,
});
