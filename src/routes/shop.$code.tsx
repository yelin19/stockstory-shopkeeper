import { createFileRoute, notFound } from "@tanstack/react-router";
import { MessageCircle } from "lucide-react";
import { getPublicProduct } from "@/lib/public-shop.functions";
import { productImageUrl } from "@/lib/shop-data";
import { money } from "@/lib/export";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/shop/$code")({
  loader: async ({ params }) => {
    const r = await getPublicProduct({ data: { code: params.code } });
    if (!r.product) throw notFound();
    return r;
  },
  head: ({ loaderData, params }) => {
    if (!loaderData?.product) return { meta: [{ title: "ပစ္စည်းမတွေ့ပါ" }] };
    const p = loaderData.product;
    const title = `${p.name} — ${money(p.price, p.currency)}`;
    const desc = p.description?.slice(0, 160) || `${p.name} · ${p.category} · Order on Messenger with code ${p.code}`;
    const img = p.image_url ? `${loaderData.origin}${productImageUrl(p.code, p.image_url)}` : null;
    return {
      meta: [
        { title },
        { name: "description", content: desc },
        { property: "og:title", content: title },
        { property: "og:description", content: desc },
        { property: "og:type", content: "product" },
        { name: "twitter:card", content: "summary_large_image" },
        { property: "og:url", content: `${loaderData.origin}/shop/${params.code}` },
        { property: "product:price:amount", content: String(p.price) },
        { property: "product:price:currency", content: p.currency ?? "MMK" },
        ...(img ? [{ property: "og:image", content: img }, { name: "twitter:image", content: img }] : []),
      ],
      links: [{ rel: "canonical", href: `/shop/${params.code}` }],
    };
  },
  notFoundComponent: () => <div className="grid min-h-screen place-items-center text-muted-foreground">ဤပစ္စည်းကို မရရှိနိုင်ပါ။</div>,
  component: ProductPage,
});

function ProductPage() {
  const { product: p } = Route.useLoaderData();
  if (!p) return null;
  const mme = p.messenger_username && p.stock > 0 ? `https://m.me/${p.messenger_username}?text=${encodeURIComponent(`${p.code} 1`)}` : null;
  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto grid max-w-5xl gap-8 px-5 py-10 md:grid-cols-2 md:py-16">
        <div className="overflow-hidden rounded-3xl bg-muted">
          {p.image_url ? <img src={productImageUrl(p.code, p.image_url)} alt={p.name} className="aspect-square size-full object-cover" /> : <div className="aspect-square" />}
        </div>
        <div className="flex flex-col justify-center gap-5">
          <div className="text-sm font-semibold uppercase tracking-widest text-primary">{p.shop_name ?? "ဈေးဆိုင်"} · {p.category}</div>
          <h1 className="text-4xl font-extrabold md:text-5xl">{p.name}</h1>
          <div className="font-display text-3xl font-bold">{money(p.price, p.currency)}</div>
          {typeof p.sold_count === "number" && <div className="text-sm text-muted-foreground">{p.sold_count.toLocaleString("en-US")} ခု ရောင်းပြီး</div>}
          <div className={p.stock > 0 ? "text-success" : "text-destructive"}>{p.stock > 0 ? `${p.stock} လက်ကျန်` : "လက်ကျန်ကုန်ပြီ"}</div>
          {p.description && <p className="whitespace-pre-line text-muted-foreground">{p.description}</p>}
          {p.stock > 0 && <div className="rounded-xl bg-secondary p-4 text-sm">ပစ္စည်း Code <b className="font-mono text-lg">{p.code}</b> — Messenger တွင် <b>{p.code} 1</b> ပို့ပြီး ၁ ခု အော်ဒါတင်ပါ။</div>}
          {p.stock > 0 && !p.messenger_username && <p className="text-sm text-muted-foreground">Messenger မှာမှာယူရန် ဆိုင်၏ Page username ကို ဆိုင်ရှင်ထံမှ ရယူပါ။</p>}
          {mme && (
            <Button asChild size="lg" className="bg-accent text-accent-foreground hover:bg-accent/90">
              <a href={mme} target="_blank" rel="noreferrer"><MessageCircle /> Messenger မှ အော်ဒါတင်မည်</a>
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
