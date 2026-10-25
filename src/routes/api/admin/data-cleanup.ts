import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import type { Database } from "@/integrations/supabase/types";

const dateRange = {
  start_at: z.string().datetime({ offset: true }),
  end_at: z.string().datetime({ offset: true }),
};
const dataset = z.enum(["orders", "stock_history"]);
const requestSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("preview"), dataset, ...dateRange }),
  z.object({
    action: z.literal("delete"),
    dataset,
    ...dateRange,
    expected_count: z.number().int().min(0).max(2_147_483_647),
  }),
]);

export const Route = createFileRoute("/api/admin/data-cleanup")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const authorization = request.headers.get("authorization");
        const token = authorization?.replace(/^Bearer\s+/i, "");
        if (!token) return Response.json({ error: "အကောင့်ဝင်ရန်လိုပါသည်။" }, { status: 401 });

        const parsed = requestSchema.safeParse(await request.json().catch(() => null));
        if (!parsed.success)
          return Response.json(
            { error: "ရက်စွဲ သို့မဟုတ် တောင်းဆိုမှု မမှန်ပါ။" },
            { status: 400 },
          );
        const body = parsed.data;
        const startTimestamp = Date.parse(body.start_at);
        const endTimestamp = Date.parse(body.end_at);
        if (
          !Number.isFinite(startTimestamp) ||
          !Number.isFinite(endTimestamp) ||
          endTimestamp <= startTimestamp
        ) {
          return Response.json({ error: "စတင်ချိန်ထက် ဆုံးချိန် နောက်ကျရပါမည်။" }, { status: 400 });
        }

        const supabaseUrl = process.env["SUPABASE_URL"];
        const publishableKey = process.env["SUPABASE_PUBLISHABLE_KEY"];
        if (!supabaseUrl || !publishableKey)
          return Response.json({ error: "ဒေတာဘေ့စ်ဝန်ဆောင်မှု မပြင်ဆင်ရသေးပါ။" }, { status: 500 });

        const { createClient } = await import("@supabase/supabase-js");
        const authClient = createClient<Database>(supabaseUrl, publishableKey, {
          auth: { persistSession: false },
          global: { headers: { Authorization: `Bearer ${token}` } },
        });
        const { data: userData, error: userError } = await authClient.auth.getUser(token);
        if (userError || !userData.user)
          return Response.json({ error: "အကောင့်ဝင်ရန်လိုပါသည်။" }, { status: 401 });

        try {
          if (body.action === "preview" && body.dataset === "orders") {
            const { data, error } = await authClient.rpc("preview_order_history_cleanup", {
              _start_at: body.start_at,
              _end_at: body.end_at,
            });
            if (error) throw error;
            const row = data?.[0];
            return Response.json({
              ok: true,
              eligible_count: Number(row?.eligible_count ?? 0),
              protected_count: Number(row?.protected_count ?? 0),
            });
          }

          if (body.action === "preview" && body.dataset === "stock_history") {
            const { data, error } = await authClient.rpc("preview_stock_history_cleanup", {
              _start_at: body.start_at,
              _end_at: body.end_at,
            });
            if (error) throw error;
            return Response.json({ ok: true, record_count: Number(data?.[0]?.record_count ?? 0) });
          }

          if (body.action === "delete" && body.dataset === "orders") {
            const { data, error } = await authClient.rpc("delete_order_history_range", {
              _start_at: body.start_at,
              _end_at: body.end_at,
              _expected_count: body.expected_count,
            });
            if (error) throw error;
            return Response.json({ ok: true, deleted_count: Number(data ?? 0) });
          }

          if (body.action === "delete" && body.dataset === "stock_history") {
            const { data, error } = await authClient.rpc("delete_stock_history_range", {
              _start_at: body.start_at,
              _end_at: body.end_at,
              _expected_count: body.expected_count,
            });
            if (error) throw error;
            return Response.json({ ok: true, deleted_count: Number(data ?? 0) });
          }

          return Response.json({ error: "တောင်းဆိုမှု မမှန်ပါ။" }, { status: 400 });
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          if (message.includes("CLEANUP_PREVIEW_STALE")) {
            return Response.json(
              { error: "အရေအတွက် ပြောင်းလဲသွားပါပြီ။ ပြန်စစ်ပြီးမှ ဖျက်ပါ။" },
              { status: 409 },
            );
          }
          if (message.includes("Invalid date range")) {
            return Response.json({ error: "ရက်စွဲအပိုင်းအခြား မမှန်ပါ။" }, { status: 400 });
          }
          console.error("Data cleanup request failed", error);
          return Response.json(
            { error: "ဒေတာကို စစ်ဆေး/ဖျက်မရပါ။ ခဏနေပြီး ထပ်စမ်းပါ။" },
            { status: 500 },
          );
        }
      },
    },
  },
});
