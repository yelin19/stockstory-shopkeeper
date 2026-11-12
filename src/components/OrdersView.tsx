import { useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useMemo, useRef, useState } from "react";
import { format } from "date-fns";
import { toast } from "sonner";
import { FileSpreadsheet, Copy, Truck, Undo2, Check, Printer, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { isOrderShipped, ordersQuery, settingsQuery, type Order } from "@/lib/shop-data";
import { exportXlsx, money, type Row } from "@/lib/export";
import { sumByCurrency } from "@/lib/currency";
import { formatQuantity } from "@/lib/product-unit";
import { paymentMethodLabel } from "@/lib/payment-method";
import { LABEL_HEIGHT_MM, LABEL_PAGE_RULE, LABEL_WIDTH_MM, printLabelsSilently } from "@/lib/label-print";
import { formatRecipientAddress, selectedOrdersForPrint } from "@/lib/order-print";
import {
  toggleAllPublicOrders,
  togglePublicOrderSelection,
  uniquePublicOrderIds,
} from "@/lib/order-selection";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Mode = "orders" | "addresses";

const sel = "h-9 rounded-md border bg-card px-2 text-sm";
type CartItemSummary = { product: string; qty: number; unit: string; price: number };
const recipientAddressText = (order: Pick<Order, "township" | "address">) =>
  formatRecipientAddress(order.township, order.address);

function cartItemsFromNote(note: string | null | undefined): CartItemSummary[] {
  const marker = "CART_ITEMS:";
  if (!note?.startsWith(marker)) return [];
  try {
    const value = JSON.parse(note.slice(marker.length)) as unknown;
    if (!Array.isArray(value)) return [];
    return value.filter((item): item is CartItemSummary => {
      const row = item as Partial<CartItemSummary>;
      return typeof row.product === "string" && typeof row.unit === "string" && Number.isFinite(Number(row.qty)) && Number.isFinite(Number(row.price));
    });
  } catch {
    return [];
  }
}

function orderProductsText(order: Order): string[] {
  const items = cartItemsFromNote(order.note);
  if (items.length > 0) return items.map((item) => `ပစ္စည်း: ${item.product} · ${formatQuantity(item.qty, item.unit)}`);
  return [`ပစ္စည်း: ${order.product_name} · ${formatQuantity(order.quantity, order.product_unit)}`];
}

export function OrdersView({ mode }: { mode: Mode }) {
  const labelPrintRef = useRef<HTMLDivElement>(null);
  const qc = useQueryClient();
  const { data: orders } = useSuspenseQuery(ordersQuery);
  const { data: settings } = useSuspenseQuery(settingsQuery);
  const [product, setProduct] = useState("");
  const [orderNo, setOrderNo] = useState("");
  const [editingDeliveryId, setEditingDeliveryId] = useState<string | null>(null);
  const [selectedPublicOrderIds, setSelectedPublicOrderIds] = useState<string[]>([]);
  const [bulkTrackingUrl, setBulkTrackingUrl] = useState("");
  const [bulkTrackingBusy, setBulkTrackingBusy] = useState(false);
  const [returningOrderId, setReturningOrderId] = useState<string | null>(null);
  const [approvingPaymentId, setApprovingPaymentId] = useState<string | null>(null);
  const [deletingOrderId, setDeletingOrderId] = useState<string | null>(null);
  const [bulkDeleteBusy, setBulkDeleteBusy] = useState(false);

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
  const selectablePublicOrderIds = useMemo(
    () =>
      uniquePublicOrderIds(
        filtered.filter((o) =>
          mode === "orders" ? !isOrderShipped(o) : o.status !== "cancelled" && isOrderShipped(o),
        ),
      ),
    [filtered, mode],
  );
  const firstOrderRowIds = useMemo(() => {
    const seen = new Set<string>();
    const first = new Set<string>();
    for (const order of filtered) {
      if (seen.has(order.public_order_id)) continue;
      seen.add(order.public_order_id);
      first.add(order.id);
    }
    return first;
  }, [filtered]);
  const pendingPaymentOrders = useMemo(() => {
    const seen = new Set<string>();
    return filtered.filter((o) => {
      if (o.payment_status !== "proof_submitted" || seen.has(o.public_order_id)) return false;
      seen.add(o.public_order_id);
      return true;
    });
  }, [filtered]);
  const visibleOrders = useMemo(() => {
    const groups = new Map<string, Order[]>();
    for (const order of filtered) groups.set(order.public_order_id, [...(groups.get(order.public_order_id) ?? []), order]);
    return [...groups.values()].map((group) => {
      const first = group[0]!;
      return group.length === 1 ? first : { ...first, total: group.reduce((sum, order) => sum + Number(order.total), 0) };
    });
  }, [filtered]);

  const rows: Row[] = filtered.map((o) =>
    mode === "orders"
      ? {
          "ဝယ်ယူမှု ID": o.public_order_id, "ငွေပေးချေမှုနည်းလမ်း": paymentMethodLabel(o.payment_method), Date: format(new Date(o.created_at), "dd/MM/yyyy HH:mm"), Code: o.product_code,
          Product: o.product_name, Qty: o.quantity, Unit: o.product_unit, Currency: o.currency ?? settings?.currency ?? "MMK", "Unit price": Number(o.unit_price), Total: Number(o.total),
          Customer: o.customer_name, Phone: o.phone, Address: recipientAddressText(o), Note: o.note ?? "",
          Status: o.status,
        }
      : {
          "ဝယ်ယူမှု ID": o.public_order_id, "ငွေပေးချေမှုနည်းလမ်း": paymentMethodLabel(o.payment_method), Customer: o.customer_name, Phone: o.phone, Address: recipientAddressText(o),
          Product: `${o.product_code} ${o.product_name}`, Qty: o.quantity, Unit: o.product_unit, Currency: o.currency ?? settings?.currency ?? "MMK", Total: Number(o.total), Note: o.note ?? "",
      },
  );
  const exportRows = rows.filter((_, index) => filtered[index]?.status !== "cancelled");
  const fname = `${mode}-${format(new Date(), "yyyyMMdd-HHmm")}`;

  async function copyAddress(o: Order) {
    const recipientAddress = recipientAddressText(o);
    const printable = selectedOrdersForPrint(orders, [o], [o.public_order_id])[0];
    const text = [
      "ผู้ส่ง",
      `ชื่อผู้ส่ง: ${settings?.sender_name || "ပို့သူအမည် မထည့်ရသေးပါ"}`,
      `เบอร์โทรศัพท์: ${settings?.sender_phone || "ပို့သူဖုန်း မထည့်ရသေးပါ"}`,
      `ที่อยู่: ${settings?.sender_address || "ပို့သူလိပ်စာ မထည့်ရသေးပါ"}`,
      "────────────────────────",
      `ผู้รับ                         Order #${o.public_order_id}`,
      `ชื่อผู้รับ: ${o.customer_name}`,
      `เบอร์โทรศัพท์: ${o.phone}`,
      `ที่อยู่: ${recipientAddress}`,
      "────────────────────────",
      ...(printable?.print_products ?? orderProductsText(o)),
      `စုစုပေါင်း: ${money(printable?.print_total ?? o.total, o.currency ?? settings?.currency)}`,
    ].join("\n");
    try {
      await navigator.clipboard.writeText(text);
      toast.success(`ဝယ်ယူမှု ID ${o.public_order_id} ၏ လိပ်စာကို Copy လုပ်ပြီးပါပြီ`);
    } catch {
      toast.error("လိပ်စာ Copy လုပ်မရပါ။ Browser permission ကို စစ်ပါ");
    }
  }

  function toggleOrder(publicOrderId: string) {
    setSelectedPublicOrderIds((current) => togglePublicOrderSelection(current, publicOrderId));
  }

  function toggleAllFiltered() {
    setSelectedPublicOrderIds((current) =>
      toggleAllPublicOrders(current, selectablePublicOrderIds),
    );
  }

  async function deleteSelectedOrders() {
    const selected = filtered.filter((o) =>
      selectedPublicOrderIds.includes(o.public_order_id) &&
      (mode === "orders" ? !isOrderShipped(o) : o.status !== "cancelled" && isOrderShipped(o)),
    );
    if (!selected.length) return void toast.info("ဖျက်မည့်အော်ဒါကို အရင်ရွေးပါ");
    const orderIds = [...new Set(selected.map((o) => o.public_order_id))];
    const message = mode === "orders"
      ? `${orderIds.length} ခုသော အော်ဒါကို ဖျက်မည်လား။ Stock ကို ပြန်ထည့်ပါမည်။`
      : `${orderIds.length} ခုသော ပို့ပြီးသား Order မှတ်တမ်းကို အပြီးဖျက်မည်လား။ Stock ပြန်မထည့်ပါ။`;
    if (!window.confirm(message)) return;
    setBulkDeleteBusy(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) throw new Error("အကောင့်ဝင်ထားရန်လိုပါသည်");
      const response = await fetch("/api/admin/order-delete", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
        body: JSON.stringify({ public_order_ids: orderIds, mode: mode === "orders" ? "pending" : "shipped" }),
      });
      const result = await response.json() as { error?: string; deleted?: number };
      if (!response.ok) throw new Error(result.error || "အော်ဒါများဖျက်မရပါ");
      toast.success(`${orderIds.length} ခုကို ဖျက်ပြီးပါပြီ`);
      setSelectedPublicOrderIds([]);
      qc.invalidateQueries();
    } catch (err) {
      toast.error(`အော်ဒါများဖျက်မရပါ: ${(err as Error).message}`);
    } finally {
      setBulkDeleteBusy(false);
    }
  }

  async function applyBulkTrackingLink() {
    const link = bulkTrackingUrl.trim();
    if (!selectedPublicOrderIds.length) return void toast.info("Tracking link ထည့်မည့်အော်ဒါကို အရင်ရွေးပါ");
    if (!/^https?:\/\//i.test(link)) return void toast.error("https:// ဖြင့်စသော Tracking link ထည့်ပါ");
    if (bulkTrackingBusy) return;
    setBulkTrackingBusy(true);
    const selectedRowIds = scopedOrders
      .filter((order) => selectedPublicOrderIds.includes(order.public_order_id))
      .map((order) => order.id);
    const { error } = await supabase.from("orders").update({ tracking_url: link }).in("id", selectedRowIds);
    setBulkTrackingBusy(false);
    if (error) return void toast.error(error.message);
    toast.success(`${selectedPublicOrderIds.length} ခုတွင် Tracking link ထည့်ပြီးပါပြီ`);
    setSelectedPublicOrderIds([]);
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

  async function deleteOrder(o: Order) {
    if (deletingOrderId) return;
    if (!window.confirm(`ဝယ်ယူမှု ID ${o.public_order_id} ကို ဖျက်မည်လား။ Stock ကို ပြန်ထည့်ပါမည်။`)) return;
    setDeletingOrderId(o.id);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) throw new Error("အကောင့်ဝင်ထားရန်လိုပါသည်");
      const response = await fetch("/api/admin/order-delete", { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${token}` }, body: JSON.stringify({ public_order_ids: [o.public_order_id], mode: "pending" }) });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || "အော်ဒါဖျက်မရပါ");
      toast.success(`ဝယ်ယူမှု ID ${o.public_order_id} ကို ဖျက်ပြီးပါပြီ`);
      qc.invalidateQueries();
    } catch (err) {
      toast.error(`အော်ဒါဖျက်မရပါ: ${(err as Error).message}`);
    } finally {
      setDeletingOrderId(null);
    }
  }

  // group by category → product for print
  const grouped = useMemo(() => {
    const m = new Map<string, Map<string, Order[]>>();
    for (const o of visibleOrders) {
      if (!m.has(o.category)) m.set(o.category, new Map());
      const pm = m.get(o.category)!;
      const k = `${o.product_code} · ${o.product_name}`;
      pm.set(k, [...(pm.get(k) ?? []), o]);
    }
    return m;
  }, [visibleOrders]);
  const selectedAddressOrders = useMemo(
    () => selectedOrdersForPrint(orders, visibleOrders, selectedPublicOrderIds),
    [orders, selectedPublicOrderIds, visibleOrders],
  );

  async function printAddressLabels() {
    if (!selectedAddressOrders.length) return void toast.info("လိပ်စာတံဆိပ် ပုံနှိပ်မည့် အော်ဒါကို အရင်ရွေးပါ");
    const labelRoot = labelPrintRef.current;
    if (!labelRoot) return void toast.error("လိပ်စာတံဆိပ် ပုံစံကို ပြင်ဆင်မရပါ");
    try {
      if (await printLabelsSilently(labelRoot)) {
        toast.success(`${selectedAddressOrders.length} ခုကို Silent Print လွှတ်ပြီးပါပြီ`);
        return;
      }
    } catch (error) {
      console.warn("Silent print agent unavailable; opening browser print dialog", error);
      toast.info(`QZ Tray မချိတ်ထားသေးပါ။ ${LABEL_WIDTH_MM}×${LABEL_HEIGHT_MM} mm အရွယ်အစားကို အလိုအလျောက်ရွေးရန် QZ Tray လိုအပ်ပါသည်။ Browser Print ကို ဖွင့်ပါမည်`);
    }
    const printStyle = document.createElement("style");
    printStyle.textContent = LABEL_PAGE_RULE;
    document.head.appendChild(printStyle);
    const printAncestors: HTMLElement[] = [];
    let ancestor = labelRoot.parentElement;
    while (ancestor && ancestor !== document.body) {
      printAncestors.push(ancestor);
      ancestor.classList.add("thermal-label-print-ancestor");
      ancestor = ancestor.parentElement;
    }
    document.body.classList.add("thermal-label-print-mode");
    let cleaned = false;
    const cleanup = () => {
      if (cleaned) return;
      cleaned = true;
      document.body.classList.remove("thermal-label-print-mode");
      printAncestors.forEach((element) => element.classList.remove("thermal-label-print-ancestor"));
      printStyle.remove();
      window.removeEventListener("afterprint", cleanup);
      window.clearTimeout(fallbackTimer);
    };
    const fallbackTimer = window.setTimeout(cleanup, 60_000);
    window.addEventListener("afterprint", cleanup, { once: true });
    window.print();
  }

  return (
    <div className="space-y-5">
      <div ref={labelPrintRef} className="thermal-label-print" aria-hidden="true">
        {selectedAddressOrders.map((o) => (
          <article className="thermal-label-page" key={o.id}>
            <div className="thermal-label-sender">
              <div className="thermal-label-section-title">ผู้ส่ง</div>
              <strong>ชื่อผู้ส่ง: {settings?.sender_name || "ပို့သူအမည် မထည့်ရသေးပါ"}</strong>
              {settings?.sender_phone && <div className="thermal-label-phone">เบอร์โทรศัพท์: {settings.sender_phone}</div>}
              <div className="thermal-label-address">
                <strong>ที่อยู่</strong>
                <div>{settings?.sender_address || "ပို့သူလိပ်စာ မထည့်ရသေးပါ"}</div>
              </div>
            </div>
            <div className="thermal-label-divider" />
            <div className="thermal-label-recipient-block">
              <div className="thermal-label-heading"><span>ผู้รับ</span><strong>#{o.public_order_id}</strong></div>
              <div className="thermal-label-recipient">ชื่อผู้รับ: {o.customer_name}</div>
              <div className="thermal-label-phone">เบอร์โทรศัพท์: {o.phone}</div>
              <div className="thermal-label-address">
                <strong>ที่อยู่</strong>
                <div>{recipientAddressText(o)}</div>
              </div>
            </div>
            <div className="thermal-label-product">
              {o.print_products.map((line) => <div key={line}>{line}</div>)}
              <div className="thermal-label-total">စုစုပေါင်း: {money(o.print_total, o.currency ?? settings?.currency)}</div>
            </div>
          </article>
        ))}
      </div>
      <div className="no-print flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold">{mode === "orders" ? "အော်ဒါများ" : "ပို့ပြီးသော Order များ"}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{mode === "orders" ? "မပို့ရသေးသော Order များသာ ပြထားသည်" : "ပို့ပြီးသော Order များကိုသာ ပြန်ရှာနိုင်သည်"}</p>
        </div>
        {mode === "orders" && <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => exportXlsx(exportRows, `${fname}.xlsx`)} disabled={!exportRows.length}><FileSpreadsheet /> Excel ထုတ်မည်</Button>
        </div>}
      </div>

      <div className="no-print flex flex-wrap items-center gap-2 rounded-2xl border bg-card p-3">
        <div className="basis-full text-sm font-semibold">{mode === "orders" ? "အော်ဒါများကို ရွေးချယ်စီမံရန်" : "ပို့ပြီးသော Order များကို ရွေးချယ်စီမံရန်"}</div>
        <Button size="sm" variant="outline" onClick={toggleAllFiltered} disabled={!filtered.length}>
          {selectablePublicOrderIds.length > 0 && selectablePublicOrderIds.every((id) => selectedPublicOrderIds.includes(id)) ? "ရွေးထားတာဖြုတ်မည်" : "အားလုံးရွေးမည်"}
        </Button>
        <span className="text-sm text-muted-foreground">ရွေးထားသည်: {selectedPublicOrderIds.length} ခု</span>
        <Button size="sm" variant="destructive" onClick={deleteSelectedOrders} disabled={!selectedPublicOrderIds.length || bulkDeleteBusy}>
          <Trash2 /> {bulkDeleteBusy ? "ဖျက်နေသည်..." : "ရွေးထားတာဖျက်မည်"}
        </Button>
        {mode === "orders" && <>
        <Button size="sm" variant="outline" onClick={printAddressLabels} disabled={!selectedAddressOrders.length} title="ရွေးထားသောအော်ဒါတစ်ခုစီအတွက် 100×150 မီလီမီတာ လိပ်စာတံဆိပ် တစ်ခုစီထုတ်မည်"><Printer /> လိပ်စာတံဆိပ် ပုံနှိပ်မည် ({selectedAddressOrders.length})</Button>
        <Input className="min-w-[240px] flex-1" value={bulkTrackingUrl} onChange={(e) => setBulkTrackingUrl(e.target.value)} placeholder="တူညီသော Tracking link (https://...)" />
        <Button size="sm" onClick={applyBulkTrackingLink} disabled={!selectedPublicOrderIds.length || bulkTrackingBusy}>
          {bulkTrackingBusy ? "သိမ်းနေသည်..." : "ရွေးထားသောအော်ဒါများသို့ Link ထည့်မည်"}
        </Button>
        <span className="basis-full text-xs text-muted-foreground">Tracking link တူသောအော်ဒါများကို ရွေးပြီး ထည့်ပါ။ Tracking ID ကို အော်ဒါတစ်ခုချင်းစီမှာ သီးသန့်ထည့်နိုင်ပါသည်။</span>
        <span className="basis-full text-xs text-muted-foreground">လိပ်စာပုံနှိပ်ရာတွင် ရွေးထားသော အော်ဒါတစ်ခုစီကို 100×150 မီလီမီတာ စာရွက်တစ်ရွက်စီဖြင့် ထုတ်ပေးပါမည်။</span>
        </>}
        {mode === "addresses" && <span className="basis-full text-xs text-muted-foreground">ပို့ပြီးသား Order မှတ်တမ်းကိုသာ ဖယ်ရှားမည်ဖြစ်ပြီး Stock နှင့် Customer လိပ်စာကို မပြောင်းလဲပါ။</span>}
      </div>

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
        {new Set(filtered.map((o) => o.public_order_id)).size} အော်ဒါ · {sumByCurrency(filtered.filter((o) => o.status !== "cancelled"), settings?.currency)}
      </div>

      {mode === "orders" && pendingPaymentOrders.length > 0 && <section className="no-print rounded-2xl border-2 border-primary/40 bg-primary/5 p-4">
        <h2 className="mb-3 text-lg font-bold">ငွေလွှဲဖြတ်ပိုင်း စစ်ဆေးရန် (ပို့ဆောင်မှုမအောင်မြင်ခဲ့သော Customer)</h2>
        <div className="space-y-3">
          {pendingPaymentOrders.map((o) => <div key={o.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card p-3 text-sm">
            <div><b>Order ID: {o.public_order_id}</b><div>{o.product_name} · {formatQuantity(o.quantity, o.product_unit)} · {money(o.total, o.currency ?? settings?.currency)}</div><div>{o.customer_name} · {o.phone} · {recipientAddressText(o)}</div></div>
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
                <span>{formatQuantity(list.reduce((s, o) => s + o.quantity, 0), list[0]?.product_unit)} · {sumByCurrency(list, settings?.currency)}</span>
              </div>
              <table className="w-full text-sm">
                <tbody>
                  {list.map((o) => (
                    <tr key={o.id} className="border-t align-top first:border-t-0">
                      <td className="px-2 py-2 align-top">{firstOrderRowIds.has(o.id) && <input aria-label={`${o.public_order_id} ရွေးမည်`} type="checkbox" checked={selectedPublicOrderIds.includes(o.public_order_id)} onChange={() => toggleOrder(o.public_order_id)} disabled={mode === "addresses" && o.status === "cancelled"} />}</td>
                      <td className="px-4 py-2 font-mono text-xs">{firstOrderRowIds.has(o.id) && <span className="font-bold">ဝယ်ယူမှု ID: {o.public_order_id}</span>}<div className="text-muted-foreground">{format(new Date(o.created_at), "dd/MM/yyyy HH:mm")}</div></td>
                      <td className="py-2"><b>{o.customer_name}</b><div>{o.phone}</div></td>
                      <td className="py-2"><div className="max-w-xs text-muted-foreground">{recipientAddressText(o)}</div>{o.note && !o.note.startsWith("CART_ITEMS:") && <div className="text-xs italic">“{o.note}”</div>}{cartItemsFromNote(o.note).length > 0 && <div className="mt-1 text-xs text-muted-foreground">Cart: {cartItemsFromNote(o.note).map((item) => `${item.product} × ${formatQuantity(item.qty, item.unit)}`).join(", ")}</div>}</td>
                      <td className="py-2 text-right">{formatQuantity(o.quantity, o.product_unit)} × {money(o.unit_price, o.currency ?? settings?.currency)}<div className="font-bold">{money(o.total, o.currency ?? settings?.currency)}</div><div className="mt-1 text-xs text-muted-foreground">{paymentMethodLabel(o.payment_method)}</div></td>
                      <td className="px-4 py-2 text-right">
                        <span className={`rounded-full px-2 py-0.5 text-xs ${o.status === "cancelled" ? "bg-destructive/15 text-destructive" : o.sent ? "bg-success/15 text-success" : "bg-warning/20"}`}>
                          {o.status === "cancelled" ? "ပယ်ဖျက်ပြီး" : o.delivery_status === "returned" ? "ပို့ဆောင်မှုမအောင်မြင်ပါ" : o.sent ? ["confirmed", "preparing"].includes(o.delivery_status) ? "ပို့ဆောင်နေပါသည်" : deliveryLabels[o.delivery_status] ?? "ပို့ဆောင်နေပါသည်" : "လက်ခံထား"}
                        </span>
                        {o.payment_status === "proof_submitted" && o.payment_proof_url && <a className="mt-1 block text-xs font-semibold text-primary underline" href={o.payment_proof_url} target="_blank" rel="noreferrer">ငွေလွှဲဖြတ်ပိုင်း ကြည့်မည်</a>}
                        {o.tracking_url && <a className="mt-1 block text-xs text-primary underline" href={o.tracking_url} target="_blank" rel="noreferrer">Tracking link</a>}
                        {mode === "orders" && (
                          <div className="no-print mt-2 flex flex-wrap justify-end gap-1">
                            {o.status !== "cancelled" && o.payment_status === "proof_submitted" && <Button size="sm" variant="default" className="h-8 px-2 text-xs" title="ငွေလွှဲဖြတ်ပိုင်းကို စစ်ဆေးပြီး အတည်ပြုမည်" onClick={() => approvePayment(o)} disabled={approvingPaymentId === o.id}><Check /> {approvingPaymentId === o.id ? "စစ်ဆေးနေသည်..." : "ငွေပေးချေမှု အတည်ပြုမည်"}</Button>}
                            {o.status !== "cancelled" && <Button size="sm" variant="outline" className="h-8 px-2 text-xs" title="Tracking ID၊ Link နှင့် ပုံထည့်ပြီး Customer ဆီ Messenger ပို့မည်" onClick={() => setEditingDeliveryId(editingDeliveryId === o.id ? null : o.id)}><Truck /> ပို့ဆောင်ရေး</Button>}
                            <Button size="sm" variant="destructive" className="h-8 px-2 text-xs" title="အော်ဒါဖျက်ပြီး Stock ပြန်ထည့်မည်" onClick={() => deleteOrder(o)} disabled={deletingOrderId === o.id}><Trash2 /> {deletingOrderId === o.id ? "ဖျက်နေသည်..." : "ဖျက်မည်"}</Button>
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
  in_transit: "ပို့ဆောင်နေပါသည်",
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
      if (file && deliveryStatus === "returned") {
        throw new Error("ပို့ဆောင်မှုမအောင်မြင်ပါအဖြစ် သတ်မှတ်ရာတွင် ဓာတ်ပုံကို Messenger သို့မပို့နိုင်ပါ။");
      }
      if (file && (!trackingNumber.trim() || !trackingUrl.trim())) {
        throw new Error("ဓာတ်ပုံကို Messenger သို့ပို့ရန် Tracking ID နှင့် Tracking link နှစ်ခုလုံးဖြည့်ပါ။");
      }
      let imageUrl: string | null = null;
      let imagePath: string | null = null;
      if (file) {
        const { data: userData } = await supabase.auth.getUser();
        if (!userData.user) throw new Error("အကောင့်ဝင်ထားရန်လိုပါသည်");
        const path = `${userData.user.id}/${order.id}-${crypto.randomUUID()}-${file.name.replace(/[^a-zA-Z0-9.]/g, "")}`;
        const { error: uploadError } = await supabase.storage.from("delivery-images").upload(path, file, { contentType: file.type, upsert: false });
        if (uploadError) throw uploadError;
        imagePath = path;
        imageUrl = supabase.storage.from("delivery-images").getPublicUrl(path).data.publicUrl;
      }
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) throw new Error("အကောင့်ဝင်ထားရန်လိုပါသည်");
      const normalizedTrackingUrl = trackingUrl.trim()
        ? (/^https?:\/\//i.test(trackingUrl.trim()) ? trackingUrl.trim() : `https://${trackingUrl.trim()}`)
        : "";
      const response = await fetch("/api/admin/order-shipping", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
        body: JSON.stringify({ order_id: order.id, delivery_status: deliveryStatus, tracking_number: trackingNumber, tracking_url: normalizedTrackingUrl, image_url: imageUrl, image_path: imagePath }),
      });
      const result = await response.json() as { error?: string; accepted?: boolean; returned?: boolean; notified?: boolean; delivery_status?: string; image_cleanup_failed?: boolean };
      if (!response.ok) throw new Error(result.error || "Messenger သို့ ပို့မရပါ");
      const label = deliveryLabels[result.delivery_status ?? "confirmed"] ?? result.delivery_status ?? "confirmed";
      if (result.image_cleanup_failed) {
        toast.warning(`ဝယ်ယူမှု ID ${order.public_order_id} ကို သိမ်းပြီး Messenger သို့ပို့ပါပြီ။ သို့သော် ဓာတ်ပုံဖိုင်ကို Storage မှ မဖယ်ရှားနိုင်ပါ။`);
      } else {
        toast.success(result.returned ? `ဝယ်ယူမှု ID ${order.public_order_id} ကို ပို့ဆောင်မှုမအောင်မြင်ပါအဖြစ် သိမ်းပြီးပါပြီ` : result.notified ? `ဝယ်ယူမှု ID ${order.public_order_id} ကို ${label} အဖြစ်သိမ်းပြီး Messenger ဆီ ပို့ပြီးပါပြီ` : `ဝယ်ယူမှု ID ${order.public_order_id} ကို ${label} အဖြစ်သိမ်းပြီးပါပြီ`);
      }
      onSaved();
    } catch (err) {
      const message = (err as Error).message;
      toast.error(message === "Failed to fetch" ? "ပို့ဆောင်မှု server သို့ ချိတ်ဆက်မရပါ။ အင်တာနက်နှင့် Login session ကို စစ်ပြီး ခဏနေကာ ထပ်စမ်းပါ။" : message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-2 space-y-2 rounded-lg border bg-muted p-3 text-left text-xs" onClick={(e) => e.stopPropagation()}>
      <div className="font-semibold">ဝယ်ယူမှု ID: {order.public_order_id} — ပို့ဆောင်ရေးအချက်အလက်</div>
      <label className="block text-xs font-medium">ပို့ဆောင်မှုအခြေအနေ<select className={`${sel} mt-1 w-full`} value="confirmed" disabled>
        <option value="confirmed">အော်ဒါလက်ခံပြီး</option>
      </select></label>
      <Input value={trackingNumber} onChange={(e) => setTrackingNumber(e.target.value)} placeholder="Tracking ID (ဒီအော်ဒါအတွက် သီးသန့်)" />
      <Input value={trackingUrl} onChange={(e) => setTrackingUrl(e.target.value)} placeholder="Tracking link (တူရင် အုပ်စုလိုက်ထည့်နိုင်)" />
      <label className="flex items-center gap-2 rounded border bg-card px-2 py-2">
        <span>ပို့ဆောင်မှုဓာတ်ပုံ</span>
        <input className="min-w-0 flex-1" type="file" accept="image/*" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
      </label>
      <p className="text-muted-foreground">ပုံကို Messenger သို့ပို့ရန် Tracking ID နှင့် Link နှစ်ခုလုံးဖြည့်ပါ။ ပုံကို Customer Messenger သို့ပို့ပြီးနောက် အော်ဒါစာရင်းထဲတွင် မသိမ်းဘဲ Storage မှ ဖယ်ရှားပါမည်။</p>
      <Button size="sm" className="w-full" disabled={busy} onClick={save}>{busy ? "Messenger သို့ ပို့နေသည်..." : "သိမ်းပြီး Customer ဆီ ပို့မည်"}</Button>
    </div>
  );
}
