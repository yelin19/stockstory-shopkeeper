import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { ShoppingCart, Minus, Plus, MessageCircle, ExternalLink } from "lucide-react";
import { getPublicCatalog } from "@/lib/public-shop.functions";
import { productImageUrl } from "@/lib/shop-data";
import { money } from "@/lib/export";
import { Button } from "@/components/ui/button";

type CatalogProduct = Awaited<ReturnType<typeof getPublicCatalog>>["products"][number];

export const Route = createFileRoute("/shop")({
  loader: () => getPublicCatalog(),
  head: ({ loaderData }) => ({ meta: [
    { title: `${loaderData?.shop.shop_name ?? "ဆိုင်"} — ပစ္စည်းများ` },
    { name: "description", content: "ပစ္စည်းများကို ရွေးချယ်ပြီး Messenger မှာ အော်ဒါတင်ပါ။" },
  ] }),
  component: ShopCatalog,
});

function ShopCatalog() {
  const { products, shop } = Route.useLoaderData();
  const [cart, setCart] = useState<Record<string, number>>({});
  const [openCart, setOpenCart] = useState(false);
  const currency = shop.currency ?? "MMK";
  const selected = useMemo(() => products.filter((p) => (cart[p.code] ?? 0) > 0), [cart, products]);
  const cartCount = selected.reduce((sum, p) => sum + (cart[p.code] ?? 0), 0);
  const total = selected.reduce((sum, p) => sum + Number(p.price) * (cart[p.code] ?? 0), 0);
  const change = (p: CatalogProduct, delta: number) => setCart((current) => {
    const next = Math.max(0, Math.min(p.stock, (current[p.code] ?? 0) + delta));
    const result = { ...current };
    if (next) result[p.code] = next; else delete result[p.code];
    return result;
  });
  const setQuantity = (p: CatalogProduct, value: string) => {
    const parsed = value === "" ? 0 : Number.parseInt(value, 10);
    const next = Number.isFinite(parsed) ? Math.max(0, Math.min(p.stock, parsed)) : 0;
    setCart((current) => {
      const result = { ...current };
      if (next) result[p.code] = next; else delete result[p.code];
      return result;
    });
  };
  const messengerUrl = () => {
    const lines = selected.map((p, index) => `${index + 1}. ${p.name} — ${cart[p.code]} ${p.unit} [${p.code}]`);
    const payload = ["CART_ORDER", ...lines, "", "အော်ဒါတင်ရန် ပို့ပေးပါသည်။"].join("\n");
    return `https://m.me/${String(shop.messenger_username ?? "").replace(/^@/, "")}?text=${encodeURIComponent(payload)}`;
  };
  return <div className="min-h-screen bg-background">
    <header className="sticky top-0 z-10 border-b bg-background/95 px-4 py-4 backdrop-blur"><div className="mx-auto flex max-w-6xl items-center justify-between gap-3"><div><h1 className="text-2xl font-bold">{shop.shop_name}</h1><p className="text-sm text-muted-foreground">ပစ္စည်းရွေးပြီး Messenger မှာ အော်ဒါတင်ပါ</p></div><Button aria-label={`Cart ထဲတွင် ${cartCount} ခုရှိသည်`} onClick={() => setOpenCart(true)} className={`h-12 min-w-[132px] rounded-xl px-4 text-base font-bold shadow-md transition-all ${cartCount > 0 ? "bg-blue-600 text-white shadow-blue-200 hover:bg-blue-700 hover:shadow-lg" : "border-2 border-slate-300 bg-white text-slate-700 hover:bg-slate-50"}`}><ShoppingCart className="size-5" /> <span>Cart</span><span className={`rounded-full px-2.5 py-0.5 text-sm font-black ${cartCount > 0 ? "bg-white text-blue-700" : "bg-slate-100 text-slate-500"}`}>{cartCount}</span></Button></div></header>
    <main className="mx-auto grid max-w-6xl gap-4 px-4 py-6 sm:grid-cols-2 lg:grid-cols-3">
      {products.map((p) => { const quantity = cart[p.code] ?? 0; return <article key={p.code} className={`overflow-hidden rounded-2xl border bg-card shadow-sm transition-all ${quantity > 0 ? "border-blue-400 ring-2 ring-blue-100" : ""}`}>
        <Link to="/shop/$code" params={{ code: p.code }} className="block" aria-label={`${p.name} ဖော်ပြချက်ကြည့်ရန်`}>
          <div className="aspect-[4/3] bg-muted">{p.image_url ? <img src={productImageUrl(p.code, p.image_url)} alt={p.name} className="size-full object-cover" /> : null}</div>
          <div className="px-4 pt-4"><div className="flex justify-between gap-3"><div><h2 className="font-bold">{p.name}</h2><p className="text-xs text-muted-foreground">#{p.code}{p.category && p.category !== "General" ? ` · ${p.category}` : ""}</p></div><b>{money(p.price, currency)}</b></div>
            {p.description && <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">{p.description}</p>}
            <p className="mt-2 text-xs font-medium text-primary"><ExternalLink className="mr-1 inline size-3" />အသေးစိတ်ဖော်ပြချက်ကြည့်ရန်</p>
          </div>
        </Link>
        <div className="space-y-3 p-4 pt-2"><div className="flex items-center justify-between gap-2 text-sm"><span>လက်ကျန်: {p.stock} {p.unit}</span><span className="font-semibold text-emerald-700">ရောင်းပြီး: {p.sold_count ?? 0} {p.unit}</span></div>
          <div className="flex items-center justify-between"><div className="flex items-center gap-2"><Button size="icon" variant="outline" disabled={!quantity} onClick={() => change(p, -1)}><Minus /></Button><input aria-label={`${p.name} အရေအတွက်`} className={`h-9 w-16 rounded-full border text-center text-base font-bold outline-none focus:ring-2 focus:ring-blue-400 ${quantity > 0 ? "border-blue-500 bg-blue-600 text-white" : "bg-muted text-foreground"}`} type="number" inputMode="numeric" min={0} max={p.stock} value={quantity} onChange={(e) => setQuantity(p, e.target.value)} /><Button size="icon" variant="outline" disabled={p.stock <= quantity} onClick={() => change(p, 1)}><Plus /></Button></div><Button disabled={!p.stock} onClick={() => change(p, 1)}>ရွေးမည်</Button></div>
        </div>
      </article>; })}
    </main>
    {openCart && <div className="fixed inset-0 z-20 bg-black/40 p-4" onClick={() => setOpenCart(false)}><section className="mx-auto mt-8 max-w-xl rounded-3xl bg-background p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}><div className="mb-5 flex items-center justify-between rounded-2xl bg-blue-600 px-5 py-4 text-white"><h2 className="text-2xl font-black">🛒 သင့် Cart</h2><span className="rounded-full bg-white px-3 py-1 text-lg font-black text-blue-700">{cartCount} ခု</span></div>{selected.length ? <div className="space-y-3">{selected.map((p) => <div key={p.code} className="flex items-center justify-between gap-3 rounded-xl border-b pb-3 text-base"><span className="font-semibold">{p.name} × <b className="text-blue-600">{cart[p.code]}</b></span><b>{money(Number(p.price) * (cart[p.code] ?? 0), currency)}</b></div>)}<div className="flex justify-between rounded-xl bg-blue-50 px-4 py-3 text-xl font-black text-blue-800"><span>စုစုပေါင်း</span><span>{money(total, currency)}</span></div><Button className="mt-4 h-12 w-full bg-blue-600 text-base font-bold hover:bg-blue-700" disabled={!shop.messenger_username} asChild><a href={messengerUrl()} target="_blank" rel="noreferrer"><MessageCircle /> Messenger မှာ အော်ဒါတင်မည်</a></Button>{!shop.messenger_username && <p className="text-sm text-destructive">ဆိုင်၏ Messenger username မသတ်မှတ်ရသေးပါ။</p>}</div> : <p className="text-muted-foreground">Cart ထဲမှာ ပစ္စည်းမရှိသေးပါ။</p>}<Button className="mt-4 h-11 w-full" variant="outline" onClick={() => setOpenCart(false)}>ပိတ်မည်</Button></section></div>}
  </div>;
}
