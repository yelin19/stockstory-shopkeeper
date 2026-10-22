import { useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { format } from "date-fns";
import { toast } from "sonner";
import { FileDown, FileSpreadsheet, Printer, Send, XCircle, CheckCircle2, Truck, Upload, ExternalLink } from "lucide-react";
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
  const [orderNo, setOrderNo] = useState("");
  const [sent, setSent] = useState<"unsent" | "sent" | "all">("unsent");
  const [editingDeliveryId, setEditingDeliveryId] = useState<string | null>(null);

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
        if (orderNo && String(o.order_no) !== orderNo.trim().replace(/^#/, "")) return false;
        if (status === "active" ? o.status === "cancelled" : status && o.status !== status) return false;
        if (sent === "unsent" && o.sent) return false;
        if (sent === "sent" && !o.sent) return false;
        return true;
      }),
    [orders, from, to, category, product, status, township, orderNo, sent],
  );

  const rows: Row[] = filtered.map((o) =>
    mode === "orders"
      ? {
          "ဝယ်ယူမှု ID": `#${o.order_no}`, Date: format(new Date(o.created_at), "yyyy-MM-dd HH:mm"), Category: o.category, Code: o.product_code,
          Product: o.product_name, Qty: o.quantity, "Unit price": Number(o.unit_price), Total: Number(o.total),
          Customer: o.customer_name, Phone: o.phone, Township: o.township, Address: o.address, Note: o.note ?? "",
          Status: o.status, Sent: o.sent ? "yes" : "no",
          "Delivery status": o.delivery_status, "Tracking number": o.tracking_number ?? "", "Tracking link": o.tracking_url ?? "", "Proof image": o.proof_image_url ?? "",
        }
      : {
          "ဝယ်ယူမှု ID": `#${o.order_no}`, Customer: o.customer_name, Phone: o.phone, Township: o.township, Address: o.address,
          Product: `${o.product_code} ${o.product_name}`, Qty: o.quantity, Total: Number(o.total), Note: o.note ?? "",
          "Delivery status": o.delivery_status, "Tracking number": o.tracking_number ?? "", "Tracking link": o.tracking_url ?? "", "Proof image": o.proof_image_url ?? "",
        },
  );
  const fname = `${mode}-${format(new Date(), "yyyyMMdd-HHmm")}`;

  async function markSent() {
    const ids = filtered.filter((o) => !o.sent && o.status !== "cancelled").map((o) => o.id);
    if (!ids.length) return void toast.info("ဤစာရင်းတွင် မပို့ရသေးသောအော်ဒါ မရှိပါ");
    if (!confirm(`${ids.length} ခုကို ပို့ပြီးဟု မှတ်မလား။ ပုံမှန်စာရင်းထုတ်ရာတွင် မပါတော့ပါ။`)) return;
    const { error } = await supabase.from("orders").update({ sent: true, sent_at: new Date().toISOString() }).in("id", ids);
    if (error) return void toast.error(error.message);
    toast.success(`${ids.length} ပို့ပြီးဟု မှတ်သားပြီးပါပြီ`);
    qc.invalidateQueries();
  }
  async function setOrder(o: Order, action: "sent" | "delivered" | "cancel") {
    const { error } =
      action === "cancel"
        ? await supabase.rpc("cancel_order", { _order_id: o.id })
        : action === "sent"
          ? await supabase.from("orders").update({ sent: !o.sent, sent_at: o.sent ? null : new Date().toISOString() }).eq("id", o.id)
          : await supabase.from("orders").update({ status: "delivered" }).eq("id", o.id);
    if (error) return void toast.error(error.message);
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
        <h1 className="text-3xl font-bold">{mode === "orders" ? "အော်ဒါများ" : "ပို့ဆောင်ရန်လိပ်စာများ"}</h1>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => exportCsv(rows, `${fname}.csv`)} disabled={!rows.length}><FileDown /> CSV</Button>
          <Button variant="outline" size="sm" onClick={() => exportXlsx(rows, `${fname}.xlsx`)} disabled={!rows.length}><FileSpreadsheet /> Excel</Button>
          <Button variant="outline" size="sm" onClick={() => window.print()}><Printer /> ပုံနှိပ်မည်</Button>
          <Button size="sm" onClick={markSent}><Send /> စာရင်းပါအော်ဒါများ ပို့ပြီးဟုမှတ်မည်</Button>
        </div>
      </div>

      <div className="no-print grid grid-cols-2 gap-2 rounded-2xl border bg-card p-3 md:grid-cols-4 xl:grid-cols-8">
        <Input value={orderNo} onChange={(e) => setOrderNo(e.target.value)} placeholder="ဝယ်ယူမှု ID (#1001)" title="ဝယ်ယူမှု ID" />
        <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} title="စတင်ရက်" />
        <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} title="အဆုံးရက်" />
        <select className={sel} value={category} onChange={(e) => setCategory(e.target.value)}>
          <option value="">အမျိုးအစားအားလုံး</option>{uniq((o) => o.category).map((c) => <option key={c}>{c}</option>)}
        </select>
        <select className={sel} value={product} onChange={(e) => setProduct(e.target.value)}>
          <option value="">ပစ္စည်းအားလုံး</option>{uniq((o) => o.product_code).map((c) => <option key={c}>{c}</option>)}
        </select>
        <select className={sel} value={township} onChange={(e) => setTownship(e.target.value)}>
          <option value="">မြို့နယ်အားလုံး</option>{uniq((o) => o.township).map((c) => <option key={c}>{c}</option>)}
        </select>
        <select className={sel} value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="active">မပယ်ဖျက်ထားသော</option><option value="">အခြေအနေအားလုံး</option>
          <option value="confirmed">အတည်ပြုပြီး</option><option value="delivered">ပို့ဆောင်ပြီး</option><option value="cancelled">ပယ်ဖျက်ပြီး</option>
        </select>
        <select className={sel} value={sent} onChange={(e) => setSent(e.target.value as typeof sent)}>
          <option value="unsent">မပို့ရသေးသည်များသာ</option><option value="sent">ပို့ပြီး (မှတ်တမ်း)</option><option value="all">ပို့ပြီး + မပို့ရသေး</option>
        </select>
      </div>

      <div className="text-sm text-muted-foreground no-print">
        {filtered.length} အော်ဒါ · {money(filtered.filter((o) => o.status !== "cancelled").reduce((s, o) => s + Number(o.total), 0))}
      </div>

      <div className="hidden print:block">
        <h1 className="mb-2 text-2xl font-bold">{mode === "orders" ? "အော်ဒါအစီရင်ခံစာ" : "ပို့ဆောင်ရေးစာရင်း"} — {format(new Date(), "yyyy-MM-dd HH:mm")}</h1>
      </div>

      {[...grouped.entries()].map(([cat, pm]) => (
        <section key={cat} className="space-y-3 break-inside-avoid">
          <h2 className="text-lg font-bold text-primary">{cat}</h2>
          {[...pm.entries()].map(([prod, list]) => (
            <div key={prod} className="overflow-x-auto rounded-xl border bg-card">
              <div className="flex justify-between border-b bg-muted px-4 py-2 text-sm font-semibold">
                <span>{prod}</span>
                <span>{list.reduce((s, o) => s + o.quantity, 0)} ခု · {money(list.reduce((s, o) => s + Number(o.total), 0))}</span>
              </div>
              <table className="w-full text-sm">
                <tbody>
                  {list.map((o) => (
                    <tr key={o.id} className="border-t align-top first:border-t-0">
                      <td className="px-4 py-2 font-mono text-xs"><span className="font-bold">ဝယ်ယူမှု ID: #{o.order_no}</span><div className="text-muted-foreground">{format(new Date(o.created_at), "MMM d HH:mm")}</div></td>
                      <td className="py-2"><b>{o.customer_name}</b><div>{o.phone}</div></td>
                      <td className="py-2"><b>{o.township}</b><div className="max-w-xs text-muted-foreground">{o.address}</div>{o.note && <div className="text-xs italic">“{o.note}”</div>}</td>
                      <td className="py-2 text-right">{o.quantity} × {money(o.unit_price)}<div className="font-bold">{money(o.total)}</div></td>
                      <td className="px-4 py-2 text-right">
                        <span className={`rounded-full px-2 py-0.5 text-xs ${o.status === "cancelled" ? "bg-destructive/15 text-destructive" : o.sent ? "bg-success/15 text-success" : "bg-warning/20"}`}>
                          {o.status === "cancelled" ? "cancelled" : o.sent ? "sent" : "unsent"}{o.status === "delivered" ? " · delivered" : ""}
                        </span>
                        {mode === "orders" && o.status !== "cancelled" && (
                          <div className="no-print mt-2 flex justify-end gap-1">
                            <Button size="sm" variant="ghost" title="ပို့ပြီး/မပို့ရသေး ပြောင်းမည်" onClick={() => setOrder(o, "sent")}><Send /></Button>
                            {o.status !== "delivered" && <Button size="sm" variant="ghost" title="ပို့ဆောင်ပြီးဟု မှတ်မည်" onClick={() => setOrder(o, "delivered")}><CheckCircle2 /></Button>}
                            <Button size="sm" variant="ghost" title="ပို့ဆောင်ရေးပြင်မည်" onClick={() => setEditingDeliveryId(editingDeliveryId === o.id ? null : o.id)}><Truck /></Button>
                            <Button size="sm" variant="ghost" title="ပယ်ဖျက်ပြီး လက်ကျန်ပြန်ဖြည့်မည်" onClick={() => confirm("ဤအော်ဒါကို ပယ်ဖျက်ပြီး လက်ကျန်ပြန်ဖြည့်မလား။") && setOrder(o, "cancel")}><XCircle /></Button>
                          </div>
                        )}
                        {editingDeliveryId === o.id && (
                          <DeliveryEditor order={o} onSaved={() => { setEditingDeliveryId(null); qc.invalidateQueries(); }} />
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
      {!filtered.length && <p className="text-muted-foreground">ဤစစ်ထုတ်မှုများနှင့် ကိုက်ညီသောအော်ဒါ မရှိပါ</p>}
    </div>
  );
}

const deliveryLabels: Record<string, string> = {
  confirmed: "အော်ဒါလက်ခံပြီး",
  preparing: "ပစ္စည်းပြင်ဆင်နေသည်",
  shipped: "ပို့ဆောင်ပြီး",
  in_transit: "ပို့ဆောင်နေသည်",
  delivered: "ရောက်ရှိပြီး",
  cancelled: "ပယ်ဖျက်ပြီး",
};

function DeliveryEditor({ order, onSaved }: { order: Order; onSaved: () => void }) {
  const [deliveryStatus, setDeliveryStatus] = useState(order.delivery_status || "confirmed");
  const [trackingNumber, setTrackingNumber] = useState(order.tracking_number ?? "");
  const [trackingUrl, setTrackingUrl] = useState(order.tracking_url ?? "");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    try {
      let proofImageUrl = order.proof_image_url;
      if (file) {
        const { data: u } = await supabase.auth.getUser();
        if (!u.user) throw new Error("အကောင့်ဝင်ထားရန်လိုပါသည်");
        const path = `${u.user.id}/${order.id}-${crypto.randomUUID()}-${file.name.replace(/[^a-zA-Z0-9.]/g, "")}`;
        const { error: uploadError } = await supabase.storage.from("order-proofs").upload(path, file, { contentType: file.type, upsert: false });
        if (uploadError) throw uploadError;
        proofImageUrl = supabase.storage.from("order-proofs").getPublicUrl(path).data.publicUrl;
      }
      const { error } = await supabase.from("orders").update({
        delivery_status: deliveryStatus,
        tracking_number: trackingNumber.trim() || null,
        tracking_url: trackingUrl.trim() || null,
        proof_image_url: proofImageUrl,
        proof_uploaded_at: file ? new Date().toISOString() : order.proof_uploaded_at,
        updated_at: new Date().toISOString(),
        status: deliveryStatus === "delivered" ? "delivered" : order.status,
      }).eq("id", order.id);
      if (error) throw error;
      toast.success("ပို့ဆောင်ရေးအချက်အလက် သိမ်းပြီးပါပြီ");
      onSaved();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-2 space-y-2 rounded-lg border bg-muted p-3 text-left text-xs" onClick={(e) => e.stopPropagation()}>
      <div className="font-semibold">ဝယ်ယူမှု ID: #{order.order_no} — ပို့ဆောင်ရေးအချက်အလက်</div>
      <select className={sel} value={deliveryStatus} onChange={(e) => setDeliveryStatus(e.target.value)}>
        {Object.entries(deliveryLabels).filter(([key]) => key !== "cancelled").map(([key, label]) => <option key={key} value={key}>{label}</option>)}
      </select>
      <Input value={trackingNumber} onChange={(e) => setTrackingNumber(e.target.value)} placeholder="Tracking number" />
      <Input value={trackingUrl} onChange={(e) => setTrackingUrl(e.target.value)} placeholder="Tracking link (https://...)" />
      <label className="flex items-center gap-2 rounded border bg-card px-2 py-2">
        <Upload className="size-4" /> ဖြတ်ပိုင်း/အထောက်အထားပုံ Upload
        <input className="min-w-0 flex-1" type="file" accept="image/*" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
      </label>
      {order.proof_image_url && <a className="inline-flex items-center gap-1 text-primary underline" href={order.proof_image_url} target="_blank" rel="noreferrer">လက်ရှိအထောက်အထားပုံ ကြည့်ရန် <ExternalLink className="size-3" /></a>}
      <Button size="sm" disabled={busy} onClick={save}>သိမ်းမည်</Button>
    </div>
  );
}
