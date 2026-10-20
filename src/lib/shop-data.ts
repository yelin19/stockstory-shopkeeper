import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

export type Product = Database["public"]["Tables"]["products"]["Row"];
export type Order = Database["public"]["Tables"]["orders"]["Row"];
export type StockEntry = Database["public"]["Tables"]["stock_history"]["Row"];
export type Settings = Database["public"]["Tables"]["shop_settings"]["Row"];

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
    const { data, error } = await supabase.from("orders").select("*").order("created_at", { ascending: false }).limit(5000);
    if (error) throw error;
    return data;
  },
});

export const stockQuery = queryOptions({
  queryKey: ["stock_history"],
  queryFn: async () => {
    const { data, error } = await supabase.from("stock_history").select("*").order("created_at", { ascending: false }).limit(2000);
    if (error) throw error;
    return data;
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

export function productImageUrl(code: string, v?: string | null) {
  return `/api/public/product-image/${encodeURIComponent(code)}${v ? `?v=${encodeURIComponent(v.slice(-12))}` : ""}`;
}
