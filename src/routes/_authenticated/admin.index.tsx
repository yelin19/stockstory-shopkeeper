import { createFileRoute } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { isSameDay, isSameMonth } from "date-fns";
import { ordersQuery, productsQuery, settingsQuery } from "@/lib/shop-data";
import { money } from "@/lib/export";
import { sumByCurrency } from "@/lib/currency";
import { formatQuantity } from "@/lib/product-unit";

export const Route = createFileRoute("/_authenticated/admin/")({
  head: () => ({ meta: [
    { title: "Sales Reports — Messenger Shop" },
    { name: "description", content: "Review Messenger shop sales and remaining stock." },
    { property: "og:title", content: "Sales Reports — Messenger Shop" },
    { property: "og:description", content: "Review Messenger shop sales and remaining stock." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary_large_image" },
    { name: "robots", content: "noindex" },
  ] }),
  loader: ({ context }) =>
    Promise.all([
      context.queryClient.ensureQueryData(ordersQuery),
      context.queryClient.ensureQueryData(productsQuery),
      context.queryClient.ensureQueryData(settingsQuery),
    ]),
  component: Reports,
});

function group<T>(items: T[], key: (t: T) => string, val: (t: T) => number, currency: (t: T) => string, quantity: (t: T) => number, unit: (t: T) => string) {
  const m = new Map<string, { total: number; qty: number; currency: string; unit: string }>();
  for (const i of items) {
    const currencyCode = currency(i);
    const unitLabel = unit(i);
    const k = `${currencyCode} · ${key(i)} · ${unitLabel}`;
    const e = m.get(k) ?? { total: 0, qty: 0, currency: currencyCode, unit: unitLabel };
    e.total += val(i);
    e.qty += quantity(i);
    m.set(k, e);
  }
  return [...m.entries()].sort((a, b) => b[1].total - a[1].total);
}

function Reports() {
  const { data: orders } = useSuspenseQuery(ordersQuery);
  const { data: products } = useSuspenseQuery(productsQuery);
  const { data: settings } = useSuspenseQuery(settingsQuery);
  const threshold = settings?.low_stock_threshold ?? 5;
  const valid = orders.filter((o) => o.status !== "cancelled");
  const returned = valid.filter((o) => o.delivery_status === "returned");
  const sales = valid.filter((o) => o.delivery_status !== "returned");
  const now = new Date();
  const totalText = (rows: typeof valid) => sumByCurrency(rows.map((o) => ({ total: o.total, currency: o.currency ?? settings?.currency })), settings?.currency);
  const today = sales.filter((o) => isSameDay(new Date(o.created_at), now));
  const month = sales.filter((o) => isSameMonth(new Date(o.created_at), now));
  const byProduct = group(sales, (o) => `${o.product_code} · ${o.product_name}`, (o) => Number(o.total), (o) => o.currency ?? settings?.currency ?? "MMK", (o) => o.quantity, (o) => o.product_unit);
  const low = products.filter((p) => p.active && p.stock <= threshold);

  const stats = [
    { l: "ယနေ့ရောင်းအား", v: totalText(today), s: `${today.length} အော်ဒါ` },
    { l: "ယခုလ", v: totalText(month), s: `${month.length} အော်ဒါ` },
    { l: "စုစုပေါင်းရောင်းအား", v: totalText(sales), s: `${sales.length} အော်ဒါ` },
    { l: "မပို့ရသေးသောအော်ဒါ", v: String(sales.filter((o) => !o.sent).length), s: "ပို့ဆောင်ရန်စောင့်နေသည်" },
    { l: "ပို့ဆောင်မှုမအောင်မြင်သည့်အရှုံး", v: totalText(returned), s: `${returned.length} အော်ဒါ` },
  ];

  return (
    <div className="space-y-8">
      <div><div className="text-sm font-semibold text-primary">{settings?.shop_name || "Messenger ဈေးဆိုင်"}</div><h1 className="text-3xl font-bold">ရောင်းအားအစီရင်ခံစာ</h1></div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {stats.map((s) => (
          <div key={s.l} className="rounded-2xl border bg-card p-5">
            <div className="text-sm text-muted-foreground">{s.l}</div>
            <div className="mt-1 font-display text-2xl font-bold">{s.v}</div>
            <div className="text-xs text-muted-foreground">{s.s}</div>
          </div>
        ))}
      </div>
      {returned.length > 0 && <section className="rounded-2xl border border-destructive/40 bg-card p-5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-bold">ပို့ဆောင်မှုမအောင်မြင်သည့်စာရင်း (အရှုံး)</h2>
          <b className="text-destructive">အရှုံးစုစုပေါင်း: {totalText(returned)}</b>
        </div>
        <div className="space-y-2 text-sm">
          {returned.map((o) => (
            <div key={o.id} className="flex flex-wrap items-center justify-between gap-2 border-t pt-2">
              <span>Order ID: {o.public_order_id} · {new Date(o.created_at).toLocaleDateString("en-GB")} · {o.product_name} · {formatQuantity(o.quantity, o.product_unit)}</span>
              <b className="text-destructive">-{money(o.total, o.currency ?? settings?.currency)}</b>
            </div>
          ))}
        </div>
      </section>}
      <Breakdown title="ပစ္စည်းအလိုက် ရောင်းအား" rows={byProduct} />
      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-2xl border bg-card p-5">
          <h2 className="mb-3 text-lg font-bold">လက်ကျန်ပစ္စည်း</h2>
          <table className="w-full text-sm">
            <tbody>
              {products.map((p) => (
                <tr key={p.id} className="border-t">
                  <td className="py-2 font-mono text-xs">{p.code}</td>
                  <td>{p.name}</td>
                  <td className="text-muted-foreground">{p.category}</td>
                  <td className={`text-right font-semibold ${p.stock <= threshold ? "text-destructive" : ""}`}>{formatQuantity(p.stock, p.unit)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!products.length && <p className="text-sm text-muted-foreground">ပစ္စည်းမရှိသေးပါ။</p>}
        </section>
        <section className="rounded-2xl border border-warning/50 bg-card p-5">
          <h2 className="mb-3 text-lg font-bold">Low stock (≤ {threshold})</h2>
          {low.length ? (
            <ul className="space-y-2 text-sm">
              {low.map((p) => (
                <li key={p.id} className="flex justify-between"><span>{p.code} · {p.name}</span><b className="text-destructive">{formatQuantity(p.stock, p.unit)} ကျန်</b></li>
              ))}
            </ul>
          ) : <p className="text-sm text-muted-foreground">ပစ္စည်းအားလုံး လုံလောက်ပါသည်။</p>}
        </section>
      </div>
    </div>
  );
}

function Breakdown({ title, rows }: { title: string; rows: [string, { total: number; qty: number; currency: string; unit: string }][] }) {
  const max = Math.max(1, ...rows.map((r) => r[1].total));
  return (
    <section className="rounded-2xl border bg-card p-5">
      <h2 className="mb-3 text-lg font-bold">{title}</h2>
      {!rows.length && <p className="text-sm text-muted-foreground">ရောင်းအားမရှိသေးပါ။</p>}
      <div className="space-y-3">
        {rows.map(([k, v]) => (
          <div key={k}>
            <div className="flex justify-between text-sm"><span>{k}</span><span className="font-semibold">{money(v.total, v.currency)} <span className="font-normal text-muted-foreground">({formatQuantity(v.qty, v.unit)})</span></span></div>
            <div className="mt-1 h-2 rounded-full bg-muted"><div className="h-2 rounded-full bg-primary" style={{ width: `${(v.total / max) * 100}%` }} /></div>
          </div>
        ))}
      </div>
    </section>
  );
}
