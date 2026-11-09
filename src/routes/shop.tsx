import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { ShoppingCart, Minus, Plus, MessageCircle } from "lucide-react";
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
  const total = selected.reduce((sum, p) => sum + Number(p.price) * (cart[p.code] ?? 0), 0);
  const change = (p: CatalogProduct, delta: number) => setCart((current) => {
    const next = Math.max(0, Math.min(p.stock, (current[p.code] ?? 0) + delta));
    const result = { ...current };
    if (next) result[p.code] = next; else delete result[p.code];
    return result;
  });
  const messengerUrl = () => {
    const payload = btoa(JSON.stringify(selected.map((p) => ({ code: p.code, qty: cart[p.code] }))));
    return `https://m.me/${String(shop.messenger_username ?? "").replace(/^@/, "")}?text=${encodeURIComponent(`CART:${payload}`)}`;
  };
  return <div className="min-h-screen bg-background">
    <header className="sticky top-0 z-10 border-b bg-background/95 px-4 py-4 backdrop-blur"><div className="mx-auto flex max-w-6xl items-center justify-between gap-3"><div><h1 className="text-2xl font-bold">{shop.shop_name}</h1><p className="text-sm text-muted-foreground">ပစ္စည်းရွေးပြီး Messenger မှာ အော်ဒါတင်ပါ</p></div><Button variant="outline" onClick={() => setOpenCart(true)}><ShoppingCart /> Cart ({selected.length})</Button></div></header>
    <main className="mx-auto grid max-w-6xl gap-4 px-4 py-6 sm:grid-cols-2 lg:grid-cols-3">
      {products.map((p) => <article key={p.code} className="overflow-hidden rounded-2xl border bg-card shadow-sm"><div className="aspect-[4/3] bg-muted">{p.image_url ? <img src={productImageUrl(p.code, p.image_url)} alt={p.name} className="size-full object-cover" /> : null}</div><div className="space-y-3 p-4"><div className="flex justify-between gap-3"><div><h2 className="font-bold">{p.name}</h2><p className="text-xs text-muted-foreground">#{p.code} · {p.category}</p></div><b>{money(p.price, currency)}</b></div>{p.description && <p className="line-clamp-2 text-sm text-muted-foreground">{p.description}</p>}<p className="text-sm">လက်ကျန်: {p.stock} {p.unit}</p><div className="flex items-center justify-between"><div className="flex items-center gap-2"><Button size="icon" variant="outline" disabled={!cart[p.code]} onClick={() => change(p, -1)}><Minus /></Button><b className="w-8 text-center">{cart[p.code] ?? 0}</b><Button size="icon" variant="outline" disabled={p.stock <= (cart[p.code] ?? 0)} onClick={() => change(p, 1)}><Plus /></Button></div><Button disabled={!p.stock} onClick={() => change(p, 1)}>ရွေးမည်</Button></div></div></article>)}
    </main>
    {openCart && <div className="fixed inset-0 z-20 bg-black/40 p-4" onClick={() => setOpenCart(false)}><section className="mx-auto mt-12 max-w-lg rounded-2xl bg-background p-5" onClick={(e) => e.stopPropagation()}><h2 className="mb-4 text-xl font-bold">🛒 သင့် Cart</h2>{selected.length ? <div className="space-y-3">{selected.map((p) => <div key={p.code} className="flex justify-between gap-3 border-b pb-2"><span>{p.name} × {cart[p.code]}</span><b>{money(Number(p.price) * (cart[p.code] ?? 0), currency)}</b></div>)}<div className="flex justify-between pt-2 text-lg font-bold"><span>စုစုပေါင်း</span><span>{money(total, currency)}</span></div><Button className="mt-4 w-full" disabled={!shop.messenger_username} asChild><a href={messengerUrl()} target="_blank" rel="noreferrer"><MessageCircle /> Messenger မှာ အော်ဒါတင်မည်</a></Button>{!shop.messenger_username && <p className="text-sm text-destructive">ဆိုင်၏ Messenger username မသတ်မှတ်ရသေးပါ။</p>}</div> : <p className="text-muted-foreground">Cart ထဲမှာ ပစ္စည်းမရှိသေးပါ။</p>}<Button className="mt-4 w-full" variant="outline" onClick={() => setOpenCart(false)}>ပိတ်မည်</Button></section></div>}
  </div>;
}
