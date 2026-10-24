import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { dispatchLowStockAlerts } from "@/lib/low-stock-alert.server";

export const Route = createFileRoute("/api/admin/low-stock-alert")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const authorization = request.headers.get("authorization");
        const token = authorization?.replace(/^Bearer\s+/i, "");
        if (!token) return Response.json({ error: "Unauthorized" }, { status: 401 });

        const parsed = z.object({ product_id: z.string().uuid().nullable().optional() }).safeParse(await request.json().catch(() => null));
        if (!parsed.success) return Response.json({ error: "Invalid product" }, { status: 400 });

        const supabaseUrl = process.env["SUPABASE_URL"];
        const publishableKey = process.env["SUPABASE_PUBLISHABLE_KEY"];
        if (!supabaseUrl || !publishableKey) return Response.json({ error: "Shop service is not configured" }, { status: 500 });

        const { createClient } = await import("@supabase/supabase-js");
        const authClient = createClient(supabaseUrl, publishableKey, {
          auth: { persistSession: false },
          global: { headers: { Authorization: `Bearer ${token}` } },
        });
        const { data: userData, error: userError } = await authClient.auth.getUser(token);
        if (userError || !userData.user) return Response.json({ error: "Unauthorized" }, { status: 401 });

        const productId = parsed.data.product_id ?? null;
        if (productId) {
          const { data: product, error: productError } = await authClient.from("products")
            .select("id")
            .eq("id", productId)
            .eq("owner_id", userData.user.id)
            .maybeSingle();
          if (productError) return Response.json({ error: productError.message }, { status: 500 });
          if (!product) return Response.json({ error: "Product not found" }, { status: 404 });
        }

        try {
          const result = await dispatchLowStockAlerts(userData.user.id, productId);
          return Response.json({ ok: true, ...result });
        } catch (error) {
          console.error("Could not process low-stock alert", error);
          return Response.json({ error: "Low-stock alert could not be processed" }, { status: 500 });
        }
      },
    },
  },
});
