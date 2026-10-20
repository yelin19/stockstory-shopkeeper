import { useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { format } from "date-fns";
import { toast } from "sonner";
import { FileDown, FileSpreadsheet, Printer, Send, XCircle, CheckCircle2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { ordersQuery, type Order } from "@/lib/shop-data";
import { exportCsv, exportXlsx, money, type Row } from "@/lib/export";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Mode = "orders" | "addresses";

const sel = "h-9 rounded-md border bg-card px-2 text-sm";

export function OrdersView({ mode }: { mode: Mode }) {
  const qc = useQueryClient();
  const { data: orders } = useSuspenseQuery(ordersQuery);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [category, setCategory] = useState("");
  const [product, setProduct] = useState("");
  const [status, setStatus] = useState("active");
  const [township, setTownship] = useState("");
  const [sent, setSent] = useState<"unsent" | "sent" | "all">("unsent");

  const uniq = (f: (o: Order) => string) => [...new Set(orders.map(f))].sort();
  const filtered = useMemo(
    () =>
      orders.filter((o) => {
        const d = o.created_at.slice(0, 10);
        if (from && d < from) return false;
        if (to && d > to) return false;
        if (category && o.category !== category) return false;
        if (product && o.product_code !== product) return false;
        if (township && o.township !== township) return false;
        if (status === "active" ? o.status === "cancelled" : status && o.status !== status) return false;
        if (sent === "unsent" && o.sent) return false;
        if (sent === "sent" && !o.sent) return false;
        return true;
      }),
    [orders, from, to, category, product, status, township, sent],
  );

  const rows: Row[] = filtered.map((o) =>
    mode === "orders"
      ? {
          "Order #": o.order_no, Date: format(new Date(o.created_at), "yyyy-MM-dd HH:mm"), Category: o.category, Code: o.product_code,
          Product: o.product_name, Qty: o.quantity, "Unit price": Number(o.unit_price), Total: Number(o.total),
          Customer: o.customer_name, Phone: o.phone, Township: o.township, Address: o.address, Note: o.note ?? "",
          Status: o.status, Sent: o.sent ? "yes" : "no",
        }
      : {
          "Order #": o.order_no, Customer: o.customer_name, Phone: o.phone, Township: o.township, Address: o.address,
          Product: `${o.product_code} ${o.product_name}`, Qty: o.quantity, Total: Number(o.total), Note: o.note ?? "",
        },
  );
  const fname = `${mode}-${format(new Date(), "yyyyMMdd-HHmm")}`;

  async function markSent() {
    const ids = filtered.filter((o) => !o.sent && o.status !== "cancelled").map((o) => o.id);
    if (!ids.length) return toast.info("No unsent orders in this list");
    if (!confirm(`Mark ${ids.length} order(s) as sent? They will be excluded from the default export.`)) return;
    const { error } = await supabase.from("orders").update({ sent: true, sent_at: new Date().toISOString() }).in("id", ids);
    if (error) return toast.error(error.message);
    toast.success(`${ids.length} marked as sent`);
    qc.invalidateQueries();
  }
  async function setOrder(o: Order, action: "sent" | "delivered" | "cancel") {
    const { error } =
      action === "cancel"
        ? await supabase.rpc("cancel_order", { _order_id: o.id })
        : action === "sent"
          ? await supabase.from("orders").update({ sent: !o.sent, sent_at: o.sent ? null : new Date().toISOString() }).eq("id", o.id)
          : await supabase.from("orders").update({ status: "delivered" }).eq("id", o.id);
    if (error) return toast.error(error.message);
    qc.invalidateQueries();
  }

  // group by category → product for print
  const grouped = useMemo(() => {
    const m = new Map<string, Map<string, Order[]>>();
    for (const o of filtered) {
      if (!m.has(o.category)) m.set(o.category, new Map());
      const pm = m.get(o.category)!;
      const k = `${o.product_code} · ${o.product_name}`;
      pm.set(k, [...(pm.get(k) ?? []), o]);
    }
    return m;
  }, [filtered]);

  return (
    <div className="space-y-5">
      <div className="no-print flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl font-bold">{mode === "orders" ? "Shop Orders" : "Delivery Addresses"}</h1>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => exportCsv(rows, `${fname}.csv`)} disabled={!rows.length}><FileDown /> CSV</Button>
          <Button variant="outline" size="sm" onClick={() => exportXlsx(rows, `${fname}.xlsx`)} disabled={!rows.length}><FileSpreadsheet /> Excel</Button>
          <Button variant="outline" size="sm" onClick={() => window.print()}><Printer /> Print</Button>
          <Button size="sm" onClick={markSent}><Send /> Mark listed as sent</Button>
        </div>
      </div>

      <div className="no-print grid grid-cols-2 gap-2 rounded-2xl border bg-card p-3 md:grid-cols-4 xl:grid-cols-7">
        <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} title="From" />
        <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} title="To" />
        <select className={sel} value={category} onChange={(e) => setCategory(e.target.value)}>
          <option value="">All categories</option>{uniq((o) => o.category).map((c) => <option key={c}>{c}</option>)}
        </select>
        <select className={sel} value={product} onChange={(e) => setProduct(e.target.value)}>
          <option value="">All products</option>{uniq((o) => o.product_code).map((c) => <option key={c}>{c}</option>)}
        </select>
        <select className={sel} value={township} onChange={(e) => setTownship(e.target.value)}>
          <option value="">All townships</option>{uniq((o) => o.township).map((c) => <option key={c}>{c}</option>)}
        </select>
        <select className={sel} value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="active">Not cancelled</option><option value="">All statuses</option>
          <option value="confirmed">Confirmed</option><option value="delivered">Delivered</option><option value="cancelled">Cancelled</option>
        </select>
        <select className={sel} value={sent} onChange={(e) => setSent(e.target.value as typeof sent)}>
          <option value="unsent">Unsent only</option><option value="sent">Sent (history)</option><option value="all">Sent + unsent</option>
        </select>
      </div>

      <div className="text-sm text-muted-foreground no-print">
        {filtered.length} orders · {money(filtered.filter((o) => o.status !== "cancelled").reduce((s, o) => s + Number(o.total), 0))}
      </div>

      <div className="hidden print:block">
        <h1 className="mb-2 text-2xl font-bold">{mode === "orders" ? "Orders report" : "Delivery list"} — {format(new Date(), "yyyy-MM-dd HH:mm")}</h1>
      </div>

      {[...grouped.entries()].map(([cat, pm]) => (
        <section key={cat} className="space-y-3 break-inside-avoid">
          <h2 className="text-lg font-bold text-primary">{cat}</h2>
          {[...pm.entries()].map(([prod, list]) => (
            <div key={prod} className="overflow-x-auto rounded-xl border bg-card">
              <div className="flex justify-between border-b bg-muted px-4 py-2 text-sm font-semibold">
                <span>{prod}</span>
                <span>{list.reduce((s, o) => s + o.quantity, 0)} units · {money(list.reduce((s, o) => s + Number(o.total), 0))}</span>
              </div>
              <table className="w-full text-sm">
                <tbody>
                  {list.map((o) => (
                    <tr key={o.id} className="border-t align-top first:border-t-0">
                      <td className="px-4 py-2 font-mono text-xs">#{o.order_no}<div className="text-muted-foreground">{format(new Date(o.created_at), "MMM d HH:mm")}</div></td>
                      <td className="py-2"><b>{o.customer_name}</b><div>{o.phone}</div></td>
                      <td className="py-2"><b>{o.township}</b><div className="max-w-xs text-muted-foreground">{o.address}</div>{o.note && <div className="text-xs italic">“{o.note}”</div>}</td>
                      <td className="py-2 text-right">{o.quantity} × {money(o.unit_price)}<div className="font-bold">{money(o.total)}</div></td>
                      <td className="px-4 py-2 text-right">
                        <span className={`rounded-full px-2 py-0.5 text-xs ${o.status === "cancelled" ? "bg-destructive/15 text-destructive" : o.sent ? "bg-success/15 text-success" : "bg-warning/20"}`}>
                          {o.status === "cancelled" ? "cancelled" : o.sent ? "sent" : "unsent"}{o.status === "delivered" ? " · delivered" : ""}
                        </span>
                        {mode === "orders" && o.status !== "cancelled" && (
                          <div className="no-print mt-2 flex justify-end gap-1">
                            <Button size="sm" variant="ghost" title="Toggle sent" onClick={() => setOrder(o, "sent")}><Send /></Button>
                            {o.status !== "delivered" && <Button size="sm" variant="ghost" title="Mark delivered" onClick={() => setOrder(o, "delivered")}><CheckCircle2 /></Button>}
                            <Button size="sm" variant="ghost" title="Cancel & restock" onClick={() => confirm("Cancel this order and return stock?") && setOrder(o, "cancel")}><XCircle /></Button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </section>
      ))}
      {!filtered.length && <p className="text-muted-foreground">No orders match these filters.</p>}
    </div>
  );
}
