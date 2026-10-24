import { useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { format } from "date-fns";
import { toast } from "sonner";
import { FileSpreadsheet, Copy, Truck, Undo2, Check } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { isOrderShipped, ordersQuery, type Order } from "@/lib/shop-data";
import { exportXlsx, money, type Row } from "@/lib/export";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Mode = "orders" | "addresses";

const sel = "h-9 rounded-md border bg-card px-2 text-sm";

export function OrdersView({ mode }: { mode: Mode }) {
  const qc = useQueryClient();
  const { data: orders } = useSuspenseQuery(ordersQuery);
  const [product, setProduct] = useState("");
  const [orderNo, setOrderNo] = useState("");
  const [editingDeliveryId, setEditingDeliveryId] = useState<string | null>(null);
  const [selectedOrderIds, setSelectedOrderIds] = useState<string[]>([]);
  const [bulkTrackingUrl, setBulkTrackingUrl] = useState("");
  const [bulkTrackingBusy, setBulkTrackingBusy] = useState(false);
  const [returningOrderId, setReturningOrderId] = useState<string | null>(null);
  const [approvingPaymentId, setApprovingPaymentId] = useState<string | null>(null);

  const scopedOrders = useMemo(
    () => orders.filter((o) => mode === "orders" ? !isOrderShipped(o) : isOrderShipped(o)),
    [orders, mode],
  );
  const uniq = (f: (o: Order) => string) => [...new Set(scopedOrders.map(f))].sort();
  const filtered = useMemo(
    () =>
      scopedOrders.filter((o) => {
        if (product && `${o.product_code}::${o.product_name}` !== product) return false;
        if (orderNo && o.public_order_id !== orderNo.trim().replace(/^#/, "")) return false;
        return true;
      }),
    [scopedOrders, product, orderNo],
  );
  const pendingPaymentOrders = useMemo(() => filtered.filter((o) => o.payment_status === "proof_submitted"), [filtered]);

  const rows: Row[] = filtered.map((o) =>
    mode === "orders"
      ? {
          "ဝယ်ယူမှု ID": o.public_order_id, Date: format(new Date(o.created_at), "dd/MM/yyyy HH:mm"), Code: o.product_code,
          Product: o.product_name, Qty: o.quantity, "Unit price": Number(o.unit_price), Total: Number(o.total),
          Customer: o.customer_name, Phone: o.phone, Address: o.address, Note: o.note ?? "",
          Status: o.status,
        }
      : {
          "ဝယ်ယူမှု ID": o.public_order_id, Customer: o.customer_name, Phone: o.phone, Address: o.address,
          Product: `${o.product_code} ${o.product_name}`, Qty: o.quantity, Total: Number(o.total), Note: o.note ?? "",
      },
  );
  const exportRows = rows.filter((_, index) => filtered[index]?.status !== "cancelled");
  const fname = `${mode}-${format(new Date(), "yyyyMMdd-HHmm")}`;

  async function copyAddress(o: Order) {
    const text = `Order ID: ${o.public_order_id}\nပစ္စည်းအမည်: ${o.product_name}\nအရေအတွက်: ${o.quantity}ထုပ်\nအမည်: ${o.customer_name}\nဖုန်း: ${o.phone}\nလိပ်စာ: ${o.address}`;
    try {
      await navigator.clipboard.writeText(text);
      toast.success(`ဝယ်ယူမှု ID ${o.public_order_id} ၏ လိပ်စာကို Copy လုပ်ပြီးပါပြီ`);
    } catch {
      toast.error("လိပ်စာ Copy လုပ်မရပါ။ Browser permission ကို စစ်ပါ");
    }
  }

  function toggleOrder(id: string) {
    setSelectedOrderIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  }

  function toggleAllFiltered() {
    const ids = filtered.filter((o) => o.status !== "cancelled").map((o) => o.id);
    setSelectedOrderIds((current) => ids.every((id) => current.includes(id)) ? current.filter((id) => !ids.includes(id)) : [...new Set([...current, ...ids])]);
  }

  async function applyBulkTrackingLink() {
    const link = bulkTrackingUrl.trim();
    if (!selectedOrderIds.length) return void toast.info("Tracking link ထည့်မည့်အော်ဒါကို အရင်ရွေးပါ");
    if (!/^https?:\/\//i.test(link)) return void toast.error("https:// ဖြင့်စသော Tracking link ထည့်ပါ");
    if (bulkTrackingBusy) return;
    setBulkTrackingBusy(true);
    const { error } = await supabase.from("orders").update({ tracking_url: link }).in("id", selectedOrderIds);
    setBulkTrackingBusy(false);
    if (error) return void toast.error(error.message);
    toast.success(`${selectedOrderIds.length} ခုတွင် Tracking link ထည့်ပြီးပါပြီ`);
    setSelectedOrderIds([]);
    setBulkTrackingUrl("");
    qc.invalidateQueries();
  }

  async function markReturned(o: Order) {
    if (returningOrderId) return;
    setReturningOrderId(o.id);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) throw new Error("အကောင့်ဝင်ထားရန်လိုပါသည်");
      const response = await fetch("/api/admin/order-shipping", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
        body: JSON.stringify({ order_id: o.id, delivery_status: "returned" }),
      });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || "ပို့ဆောင်မှုမအောင်မြင်ပါအဖြစ် သိမ်းမရပါ");
      toast.success(`ဝယ်ယူမှု ID ${o.public_order_id} ကို ပို့ဆောင်မှုမအောင်မြင်ပါအဖြစ် သိမ်းပြီးပါပြီ`);
      qc.invalidateQueries();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setReturningOrderId(null);
    }
  }

  async function approvePayment(o: Order) {
    if (approvingPaymentId) return;
    setApprovingPaymentId(o.id);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) throw new Error("အကောင့်ဝင်ထားရန်လိုပါသည်");
      const response = await fetch("/api/admin/order-shipping", { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${token}` }, body: JSON.stringify({ order_id: o.id, payment_status: "approved" }) });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || "ငွေပေးချေမှုအတည်ပြုမရပါ");
      toast.success(`Order ID ${o.public_order_id} ၏ ငွေပေးချေမှုကို အတည်ပြုပြီးပါပြီ`);
      qc.invalidateQueries();
    } catch (err) { toast.error((err as Error).message); }
    finally { setApprovingPaymentId(null); }
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
        <div>
          <h1 className="text-3xl font-bold">{mode === "orders" ? "အော်ဒါများ" : "ပို့ပြီးသော Order များ"}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{mode === "orders" ? "မပို့ရသေးသော Order များသာ ပြထားသည်" : "ပို့ပြီးသော Order များကိုသာ ပြန်ရှာနိုင်သည်"}</p>
        </div>
        {mode === "orders" && <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => exportXlsx(exportRows, `${fname}.xlsx`)} disabled={!exportRows.length}><FileSpreadsheet /> Excel ထုတ်မည်</Button>
        </div>}
      </div>

      {mode === "orders" && <div className="no-print flex flex-wrap items-center gap-2 rounded-2xl border bg-card p-3">
        <div className="basis-full text-sm font-semibold">အော်ဒါအများစုအတွက် Tracking Link ထည့်ရန်</div>
        <Button size="sm" variant="outline" onClick={toggleAllFiltered} disabled={!filtered.length}>
          {filtered.filter((o) => o.status !== "cancelled").every((o) => selectedOrderIds.includes(o.id)) ? "ရွေးထားတာဖြုတ်မည်" : "အော်ဒါများရွေးမည်"}
        </Button>
        <span className="text-sm text-muted-foreground">ရွေးထားသည်: {selectedOrderIds.length} ခု</span>
        <Input className="min-w-[240px] flex-1" value={bulkTrackingUrl} onChange={(e) => setBulkTrackingUrl(e.target.value)} placeholder="တူညီသော Tracking link (https://...)" />
        <Button size="sm" onClick={applyBulkTrackingLink} disabled={!selectedOrderIds.length || bulkTrackingBusy}>
          {bulkTrackingBusy ? "သိမ်းနေသည်..." : "ရွေးထားသောအော်ဒါများသို့ Link ထည့်မည်"}
        </Button>
        <span className="basis-full text-xs text-muted-foreground">Tracking link တူသောအော်ဒါများကို ရွေးပြီး ထည့်ပါ။ Tracking ID ကို အော်ဒါတစ်ခုချင်းစီမှာ သီးသန့်ထည့်နိုင်ပါသည်။</span>
      </div>}

      <div className="no-print rounded-2xl border bg-card p-3">
        <div className="mb-2 text-sm font-semibold">အော်ဒါရှာဖွေခြင်းနှင့် စစ်ထုတ်ခြင်း</div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <label className="text-xs text-muted-foreground">Order ID (၆ လုံး)<Input value={orderNo} onChange={(e) => setOrderNo(e.target.value)} placeholder="ဥပမာ 100001" title="Order ID" /></label>
        <label className="text-xs text-muted-foreground">ပစ္စည်းနာမည်တစ်ခုချင်းရွေး<select className={sel} value={product} onChange={(e) => setProduct(e.target.value)}>
          <option value="">ပစ္စည်းနာမည်အားလုံး</option>{uniq((o) => `${o.product_code}::${o.product_name}`).map((value) => { const [, name] = value.split("::"); return <option key={value} value={value}>{name ? `${value.split("::")[0]} - ${name}` : value}</option>; })}
        </select></label>
        </div>
      </div>

      <div className="text-sm text-muted-foreground no-print">
        {filtered.length} အော်ဒါ · {money(filtered.filter((o) => o.status !== "cancelled").reduce((s, o) => s + Number(o.total), 0))}
      </div>

      {mode === "orders" && pendingPaymentOrders.length > 0 && <section className="no-print rounded-2xl border-2 border-primary/40 bg-primary/5 p-4">
        <h2 className="mb-3 text-lg font-bold">ငွေလွှဲဖြတ်ပိုင်း စစ်ဆေးရန် (ပို့ဆောင်မှုမအောင်မြင်ခဲ့သော Customer)</h2>
        <div className="space-y-3">
          {pendingPaymentOrders.map((o) => <div key={o.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card p-3 text-sm">
            <div><b>Order ID: {o.public_order_id}</b><div>{o.product_name} · {o.quantity}ထုပ် · {money(o.total)}</div><div>{o.customer_name} · {o.phone} · {o.address}</div></div>
            <div className="flex flex-wrap gap-2"><a className="rounded-md border px-3 py-2 text-xs font-semibold text-primary underline" href={o.payment_proof_url ?? "#"} target="_blank" rel="noreferrer">ငွေလွှဲဖြတ်ပိုင်းကြည့်မည်</a><Button size="sm" onClick={() => approvePayment(o)} disabled={approvingPaymentId === o.id}><Check /> {approvingPaymentId === o.id ? "စစ်ဆေးနေသည်..." : "အတည်ပြုမည်"}</Button></div>
          </div>)}
        </div>
      </section>}

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
                      <td className="px-2 py-2 align-top"><input aria-label={`${o.public_order_id} ရွေးမည်`} type="checkbox" checked={selectedOrderIds.includes(o.id)} onChange={() => toggleOrder(o.id)} disabled={o.status === "cancelled"} /></td>
                      <td className="px-4 py-2 font-mono text-xs"><span className="font-bold">ဝယ်ယူမှု ID: {o.public_order_id}</span><div className="text-muted-foreground">{format(new Date(o.created_at), "dd/MM/yyyy HH:mm")}</div></td>
                      <td className="py-2"><b>{o.customer_name}</b><div>{o.phone}</div></td>
                      <td className="py-2"><div className="max-w-xs text-muted-foreground">{o.address}</div>{o.note && <div className="text-xs italic">“{o.note}”</div>}</td>
                      <td className="py-2 text-right">{o.quantity} × {money(o.unit_price)}<div className="font-bold">{money(o.total)}</div></td>
                      <td className="px-4 py-2 text-right">
                        <span className={`rounded-full px-2 py-0.5 text-xs ${o.status === "cancelled" ? "bg-destructive/15 text-destructive" : o.sent ? "bg-success/15 text-success" : "bg-warning/20"}`}>
                          {o.status === "cancelled" ? "ပယ်ဖျက်ပြီး" : o.delivery_status === "returned" ? "ပို့ဆောင်မှုမအောင်မြင်ပါ" : o.tracking_number?.trim() && o.tracking_url?.trim() ? "ပို့ပြီး" : "လက်ခံထား"}
                        </span>
                        {o.payment_status === "proof_submitted" && o.payment_proof_url && <a className="mt-1 block text-xs font-semibold text-primary underline" href={o.payment_proof_url} target="_blank" rel="noreferrer">ငွေလွှဲဖြတ်ပိုင်း ကြည့်မည်</a>}
                        {o.tracking_url && <a className="mt-1 block text-xs text-primary underline" href={o.tracking_url} target="_blank" rel="noreferrer">Tracking link</a>}
                        {mode === "orders" && o.status !== "cancelled" && (
                          <div className="no-print mt-2 flex flex-wrap justify-end gap-1">
                            {o.payment_status === "proof_submitted" && <Button size="sm" variant="default" className="h-8 px-2 text-xs" title="ငွေလွှဲဖြတ်ပိုင်းကို စစ်ဆေးပြီး အတည်ပြုမည်" onClick={() => approvePayment(o)} disabled={approvingPaymentId === o.id}><Check /> {approvingPaymentId === o.id ? "စစ်ဆေးနေသည်..." : "ငွေပေးချေမှု အတည်ပြုမည်"}</Button>}
                            <Button size="sm" variant="outline" className="h-8 px-2 text-xs" title="Tracking ID၊ Link နှင့် ပုံထည့်ပြီး Customer ဆီ Messenger ပို့မည်" onClick={() => setEditingDeliveryId(editingDeliveryId === o.id ? null : o.id)}><Truck /> ပို့ဆောင်ရေး</Button>
                            <Button size="sm" variant="outline" className="h-8 px-2 text-xs" title="ဝယ်ယူသူ၏ ပို့ဆောင်မည့်လိပ်စာကို Copy လုပ်မည်" onClick={() => copyAddress(o)}><Copy /> လိပ်စာ Copy</Button>
                          </div>
                        )}
                        {mode === "addresses" && o.delivery_status !== "returned" && (
                          <div className="no-print mt-2 flex justify-end">
                            <Button size="sm" variant="destructive" className="h-8 px-2 text-xs" title="ပို့ဆောင်မှုမအောင်မြင်ပါအဖြစ် သိမ်းမည်" onClick={() => markReturned(o)} disabled={returningOrderId === o.id}>
                              <Undo2 /> {returningOrderId === o.id ? "သိမ်းနေသည်..." : "ပို့ဆောင်မှုမအောင်မြင်ပါ"}
                            </Button>
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
  returned: "ပို့ဆောင်မှုမအောင်မြင်ပါ",
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
      let imageUrl: string | null = null;
      if (file) {
        const { data: userData } = await supabase.auth.getUser();
        if (!userData.user) throw new Error("အကောင့်ဝင်ထားရန်လိုပါသည်");
        const path = `${userData.user.id}/${order.id}-${crypto.randomUUID()}-${file.name.replace(/[^a-zA-Z0-9.]/g, "")}`;
        const { error: uploadError } = await supabase.storage.from("delivery-images").upload(path, file, { contentType: file.type, upsert: false });
        if (uploadError) throw uploadError;
        imageUrl = supabase.storage.from("delivery-images").getPublicUrl(path).data.publicUrl;
      }
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) throw new Error("အကောင့်ဝင်ထားရန်လိုပါသည်");
      const response = await fetch("/api/admin/order-shipping", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
        body: JSON.stringify({ order_id: order.id, delivery_status: deliveryStatus, tracking_number: trackingNumber, tracking_url: trackingUrl, image_url: imageUrl }),
      });
      const result = await response.json() as { error?: string; accepted?: boolean; returned?: boolean; notified?: boolean; delivery_status?: string };
      if (!response.ok) throw new Error(result.error || "Messenger သို့ ပို့မရပါ");
      const label = deliveryLabels[result.delivery_status ?? "confirmed"] ?? result.delivery_status ?? "confirmed";
      toast.success(result.returned ? `ဝယ်ယူမှု ID ${order.public_order_id} ကို ပို့ဆောင်မှုမအောင်မြင်ပါအဖြစ် သိမ်းပြီးပါပြီ` : result.notified ? `ဝယ်ယူမှု ID ${order.public_order_id} ကို ${label} အဖြစ်သိမ်းပြီး Messenger ဆီ ပို့ပြီးပါပြီ` : `ဝယ်ယူမှု ID ${order.public_order_id} ကို ${label} အဖြစ်သိမ်းပြီးပါပြီ`);
      onSaved();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-2 space-y-2 rounded-lg border bg-muted p-3 text-left text-xs" onClick={(e) => e.stopPropagation()}>
      <div className="font-semibold">ဝယ်ယူမှု ID: {order.public_order_id} — ပို့ဆောင်ရေးအချက်အလက်</div>
      <label className="block text-xs font-medium">ပို့ဆောင်မှုအခြေအနေ<select className={`${sel} mt-1 w-full`} value={deliveryStatus} onChange={(e) => setDeliveryStatus(e.target.value)}>
        {Object.entries(deliveryLabels).filter(([key]) => key !== "cancelled").map(([key, label]) => <option key={key} value={key}>{label}</option>)}
      </select></label>
      <Input value={trackingNumber} onChange={(e) => setTrackingNumber(e.target.value)} placeholder="Tracking ID (ဒီအော်ဒါအတွက် သီးသန့်)" />
      <Input value={trackingUrl} onChange={(e) => setTrackingUrl(e.target.value)} placeholder="Tracking link (တူရင် အုပ်စုလိုက်ထည့်နိုင်)" />
      <label className="flex items-center gap-2 rounded border bg-card px-2 py-2">
        <span>ပို့ဆောင်မှုဓာတ်ပုံ</span>
        <input className="min-w-0 flex-1" type="file" accept="image/*" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
      </label>
      <p className="text-muted-foreground">သိမ်းမည်နှိပ်လျှင် Tracking ID၊ Link နှင့် ဓာတ်ပုံကို Customer Messenger ဆီ ပြန်ပို့ပါမည်။</p>
      <Button size="sm" className="w-full" disabled={busy} onClick={save}>{busy ? "Messenger သို့ ပို့နေသည်..." : "သိမ်းပြီး Customer ဆီ ပို့မည်"}</Button>
    </div>
  );
}
