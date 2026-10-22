import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/shop-messenger")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { messengerHandlers } = await import("@/lib/shop-messenger.server");
        return messengerHandlers.GET({ request });
      },
      POST: async ({ request }) => {
        const { messengerHandlers } = await import("@/lib/shop-messenger.server");
        return messengerHandlers.POST({ request });
      },
    },
  },
});
