import { createFileRoute } from "@tanstack/react-router";

// Serves a product image by code (read-only, no private data).
export const Route = createFileRoute("/api/public/product-image/$code")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        if (!/^[A-Za-z0-9_-]{1,32}$/.test(params.code)) return new Response("Bad code", { status: 400 });
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: p } = await supabaseAdmin.from("products").select("image_url").eq("code", params.code).maybeSingle();
        if (!p?.image_url) return new Response("Not found", { status: 404 });
        const { data, error } = await supabaseAdmin.storage.from("product-images").download(p.image_url);
        if (error || !data) return new Response("Not found", { status: 404 });
        return new Response(data, {
          headers: { "content-type": data.type || "image/jpeg", "cache-control": "public, max-age=300" },
        });
      },
    },
  },
});
