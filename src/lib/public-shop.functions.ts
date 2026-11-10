import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { Database } from "@/integrations/supabase/types";
import { isValidProductCode, normalizeProductCode } from "@/lib/product-code";

export const getPublicProduct = createServerFn({ method: "GET" })
  .inputValidator((d: { code: string }) => z.object({
    code: z.string().max(64).transform(normalizeProductCode).refine(isValidProductCode, "Invalid product code"),
  }).parse(d))
  .handler(async ({ data }) => {
    const key = process.env["SUPABASE_PUBLISHABLE_KEY"]!;
    const sb = createClient<Database>(process.env["SUPABASE_URL"]!, key, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: {
        fetch: (input, init) => {
          const h = new Headers(init?.headers);
          if (key.startsWith("sb_") && h.get("Authorization") === `Bearer ${key}`) h.delete("Authorization");
          h.set("apikey", key);
          return fetch(input, { ...init, headers: h });
        },
      },
    });
    const { data: rows, error } = await sb.rpc("get_public_product", { _code: data.code });
    if (error) throw error;
    const req = getRequest();
    const url = new URL(req.url);
    const sandboxHost = url.hostname === "localhost" ? req.headers.get("x-forwarded-host") : null;
    const origin = sandboxHost ? `https://${sandboxHost}` : url.origin;
    return { product: rows?.[0] ?? null, origin };
  });

export const getPublicCatalog = createServerFn({ method: "GET" })
  .handler(async () => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: settings, error: settingsError } = await supabaseAdmin
      .from("shop_settings")
      .select("owner_id,shop_name,messenger_username,currency")
      .limit(1)
      .maybeSingle();
    if (settingsError || !settings) throw settingsError ?? new Error("Shop is not configured");
    const { data: products, error } = await supabaseAdmin
      .from("products")
      .select("id,code,name,category,price,stock,unit,image_url,description,active")
      .eq("owner_id", settings.owner_id)
      .eq("active", true)
      .order("code");
    if (error) throw error;
    const { data: orders, error: ordersError } = await supabaseAdmin
      .from("orders")
      .select("product_id,quantity,status,delivery_status")
      .eq("owner_id", settings.owner_id)
      .neq("status", "cancelled")
      .neq("delivery_status", "returned");
    if (ordersError) throw ordersError;
    const soldByProduct = new Map<string, number>();
    for (const order of orders ?? []) {
      if (order.product_id) soldByProduct.set(order.product_id, (soldByProduct.get(order.product_id) ?? 0) + Number(order.quantity ?? 0));
    }
    const catalog = (products ?? []).map((product) => ({ ...product, sold_count: soldByProduct.get(product.id) ?? 0 }));
    const req = getRequest();
    const url = new URL(req.url);
    const sandboxHost = url.hostname === "localhost" ? req.headers.get("x-forwarded-host") : null;
    return { shop: settings, products: catalog, origin: sandboxHost ? `https://${sandboxHost}` : url.origin };
  });
