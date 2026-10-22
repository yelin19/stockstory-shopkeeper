import { createFileRoute } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { isSameDay, isSameMonth } from "date-fns";
import { ordersQuery, productsQuery, settingsQuery } from "@/lib/shop-data";
import { money } from "@/lib/export";

export const Route = createFileRoute("/_authenticated/admin/")({
  loader: ({ context }) =>
    Promise.all([
      context.queryClient.ensureQueryData(ordersQuery),
      context.queryClient.ensureQueryData(productsQuery),
      context.queryClient.ensureQueryData(settingsQuery),
    ]),
  component: Reports,
});

function group<T>(items: T[], key: (t: T) => string, val: (t: T) => number) {
  const m = new Map<string, { total: number; qty: number }>();
  for (const i of items) {
    const k = key(i);
    const e = m.get(k) ?? { total: 0, qty: 0 };
    e.total += val(i);
    e.qty += 1;
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
  const now = new Date();
  const sum = (l: typeof valid) => l.reduce((s, o) => s + Number(o.total), 0);
  const today = valid.filter((o) => isSameDay(new Date(o.created_at), now));
  const month = valid.filter((o) => isSameMonth(new Date(o.created_at), now));
  const byProduct = group(valid, (o) => `${o.product_code} · ${o.product_name}`, (o) => Number(o.total));
  const byCategory = group(valid, (o) => o.category, (o) => Number(o.total));
  const low = products.filter((p) => p.active && p.stock <= threshold);

  const stats = [
    { l: "ယနေ့ရောင်းအား", v: money(sum(today)), s: `${today.length} အော်ဒါ` },
    { l: "ယခုလ", v: money(sum(month)), s: `${month.length} အော်ဒါ` },
    { l: "စုစုပေါင်းရောင်းအား", v: money(sum(valid)), s: `${valid.length} အော်ဒါ` },
    { l: "မပို့ရသေးသောအော်ဒါ", v: String(valid.filter((o) => !o.sent).length), s: "ပို့ဆောင်ရန်စောင့်နေသည်" },
  ];

  return (
    <div className="space-y-8">
      <h1 className="text-3xl font-bold">ရောင်းအားအစီရင်ခံစာ</h1>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((s) => (
          <div key={s.l} className="rounded-2xl border bg-card p-5">
            <div className="text-sm text-muted-foreground">{s.l}</div>
            <div className="mt-1 font-display text-2xl font-bold">{s.v}</div>
            <div className="text-xs text-muted-foreground">{s.s}</div>
          </div>
        ))}
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <Breakdown title="အမျိုးအစားအလိုက် ရောင်းအား" rows={byCategory} />
        <Breakdown title="ပစ္စည်းအလိုက် ရောင်းအား" rows={byProduct} />
      </div>
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
                  <td className={`text-right font-semibold ${p.stock <= threshold ? "text-destructive" : ""}`}>{p.stock}</td>
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
                <li key={p.id} className="flex justify-between"><span>{p.code} · {p.name}</span><b className="text-destructive">{p.stock} ကျန်</b></li>
              ))}
            </ul>
          ) : <p className="text-sm text-muted-foreground">ပစ္စည်းအားလုံး လုံလောက်ပါသည်။</p>}
        </section>
      </div>
    </div>
  );
}

function Breakdown({ title, rows }: { title: string; rows: [string, { total: number; qty: number }][] }) {
  const max = Math.max(1, ...rows.map((r) => r[1].total));
  return (
    <section className="rounded-2xl border bg-card p-5">
      <h2 className="mb-3 text-lg font-bold">{title}</h2>
      {!rows.length && <p className="text-sm text-muted-foreground">ရောင်းအားမရှိသေးပါ။</p>}
      <div className="space-y-3">
        {rows.map(([k, v]) => (
          <div key={k}>
            <div className="flex justify-between text-sm"><span>{k}</span><span className="font-semibold">{money(v.total)} <span className="font-normal text-muted-foreground">({v.qty})</span></span></div>
            <div className="mt-1 h-2 rounded-full bg-muted"><div className="h-2 rounded-full bg-primary" style={{ width: `${(v.total / max) * 100}%` }} /></div>
          </div>
        ))}
      </div>
    </section>
  );
}
