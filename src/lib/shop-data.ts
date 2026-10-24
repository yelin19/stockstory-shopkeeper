import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

export type Product = Database["public"]["Tables"]["products"]["Row"];
export type Order = Database["public"]["Tables"]["orders"]["Row"];
export type StockEntry = Database["public"]["Tables"]["stock_history"]["Row"];
export type Settings = Database["public"]["Tables"]["shop_settings"]["Row"];

const PAGE_SIZE = 1000;

type Cursor = { created_at: string; id: string };

function nextPageFilter(cursor: Cursor | null) {
  return cursor
    ? `created_at.lt.${cursor.created_at},and(created_at.eq.${cursor.created_at},id.lt.${cursor.id})`
    : null;
}

export function isOrderShipped(order: Pick<Order, "sent" | "delivery_status">) {
  return order.sent || order.delivery_status === "returned";
}

export const productsQuery = queryOptions({
  queryKey: ["products"],
  queryFn: async () => {
    const { data, error } = await supabase.from("products").select("*").order("code");
    if (error) throw error;
    return data;
  },
});

export const ordersQuery = queryOptions({
  queryKey: ["orders"],
  queryFn: async () => {
    const rows: Order[] = [];
    let cursor: Cursor | null = null;

    while (true) {
      let query = supabase
        .from("orders")
        .select("*")
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
        .limit(PAGE_SIZE);
      const filter = nextPageFilter(cursor);
      if (filter) query = query.or(filter);

      const { data, error } = await query;
      if (error) throw error;
      if (!data?.length) break;
      rows.push(...data);
      const last = data[data.length - 1];
      if (!last) break;
      cursor = { created_at: last.created_at, id: last.id };
    }

    return rows;
  },
});

export const stockQuery = queryOptions({
  queryKey: ["stock_history"],
  queryFn: async () => {
    const rows: StockEntry[] = [];
    let cursor: Cursor | null = null;

    while (true) {
      let query = supabase
        .from("stock_history")
        .select("*")
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
        .limit(PAGE_SIZE);
      const filter = nextPageFilter(cursor);
      if (filter) query = query.or(filter);

      const { data, error } = await query;
      if (error) throw error;
      if (!data?.length) break;
      rows.push(...data);
      const last = data[data.length - 1];
      if (!last) break;
      cursor = { created_at: last.created_at, id: last.id };
    }

    return rows;
  },
});

export const settingsQuery = queryOptions({
  queryKey: ["settings"],
  queryFn: async () => {
    const { data: u } = await supabase.auth.getUser();
    const { data, error } = await supabase.from("shop_settings").select("*").eq("owner_id", u.user!.id).maybeSingle();
    if (error) throw error;
    return data;
  },
});

export function productPageUrl(code: string, origin: string) {
  return new URL(`/shop/${encodeURIComponent(code)}`, origin).toString();
}

export function productImageUrl(code: string, version?: string | null) {
  return `/api/public/product-image/${encodeURIComponent(code)}${version ? `?v=${encodeURIComponent(version)}` : ""}`;
}
