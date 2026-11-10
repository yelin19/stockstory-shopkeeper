import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

export const Route = createFileRoute("/api/admin/order-delete")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = request.headers.get("authorization");
        const token = auth?.replace(/^Bearer\s+/i, "");
        if (!token) return Response.json({ error: "Unauthorized" }, { status: 401 });

        const parsed = z.object({
          public_order_ids: z.array(z.string().regex(/^\d{6,}$/)).min(1).max(500),
          mode: z.enum(["pending", "shipped"]),
        }).safeParse(await request.json().catch(() => null));
        if (!parsed.success) return Response.json({ error: "Invalid order deletion request" }, { status: 400 });
        const { public_order_ids: orderIds, mode } = parsed.data;

        const { createClient } = await import("@supabase/supabase-js");
        const supabaseUrl = process.env["SUPABASE_URL"];
        const publishableKey = process.env["SUPABASE_PUBLISHABLE_KEY"];
        if (!supabaseUrl || !publishableKey) return Response.json({ error: "Shop service is not configured" }, { status: 500 });
        const authClient = createClient(supabaseUrl, publishableKey, {
          auth: { persistSession: false },
          global: { headers: { Authorization: `Bearer ${token}` } },
        });
        const { data: userData, error: userError } = await authClient.auth.getUser(token);
        if (userError || !userData.user) return Response.json({ error: "Unauthorized" }, { status: 401 });

        const { data: rows, error: queryError } = await authClient
          .from("orders")
          .select("id,public_order_id,status,sent,delivery_status,psid,customer_name,phone,address")
          .eq("owner_id", userData.user.id)
          .in("public_order_id", orderIds);
        if (queryError) return Response.json({ error: queryError.message }, { status: 500 });

        const eligible = (rows ?? []).filter((row) => mode === "pending"
          ? !row.sent && row.delivery_status !== "returned"
          : row.sent || row.delivery_status === "returned");
        if (mode === "pending") {
          for (const row of eligible) {
            if (row.status === "cancelled") continue;
            const { error } = await authClient.rpc("cancel_order", { _order_id: row.id });
            if (error) return Response.json({ error: error.message }, { status: 500 });
          }
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const customers = new Map<string, { name: string; phone: string; address: string }>();
        for (const row of eligible) {
          if (!row.psid || customers.has(row.psid)) continue;
          customers.set(row.psid, {
            name: String(row.customer_name ?? ""),
            phone: String(row.phone ?? ""),
            address: String(row.address ?? ""),
          });
        }
        for (const [psid, customer] of customers) {
          const { data: session } = await supabaseAdmin
            .from("messenger_sessions")
            .select("pin_verified,state,data")
            .eq("owner_id", userData.user.id)
            .eq("psid", psid)
            .maybeSingle();
          const existingData = session?.data && typeof session.data === "object" && !Array.isArray(session.data)
            ? session.data as Record<string, unknown>
            : {};
          const { error: addressError } = await supabaseAdmin
            .from("messenger_sessions")
            .upsert({
              owner_id: userData.user.id,
              psid,
              pin_verified: Boolean(session?.pin_verified),
              state: "idle",
              data: { ...existingData, last_customer: customer },
              updated_at: new Date().toISOString(),
            });
          if (addressError) return Response.json({ error: addressError.message }, { status: 500 });
        }
        const { error: deleteError } = await supabaseAdmin
          .from("orders")
          .delete()
          .eq("owner_id", userData.user.id)
          .in("id", eligible.map((row) => row.id));
        if (deleteError) return Response.json({ error: deleteError.message }, { status: 500 });
        return Response.json({ ok: true, deleted: eligible.length });
      },
    },
  },
});
