import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { ArrowLeft, Maximize2, MessageCircle } from "lucide-react";
import { getPublicProduct } from "@/lib/public-shop.functions";
import { productImageUrl } from "@/lib/shop-data";
import { money } from "@/lib/export";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

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
    const desc =
      p.description?.slice(0, 160) ||
      `${p.name} · ${p.category} · Order on Messenger with code ${p.code}`;
    const img = p.image_url ? `${loaderData.origin}${productImageUrl(p.code, p.image_url)}` : null;
    const productPath = `/shop/${encodeURIComponent(params.code)}`;
    return {
      meta: [
        { title },
        { name: "description", content: desc },
        { property: "og:title", content: title },
        { property: "og:description", content: desc },
        { property: "og:type", content: "product" },
        { name: "twitter:card", content: "summary_large_image" },
        { property: "og:url", content: `${loaderData.origin}${productPath}` },
        { property: "product:price:amount", content: String(p.price) },
        { property: "product:price:currency", content: p.currency ?? "MMK" },
        ...(img
          ? [
              { property: "og:image", content: img },
              { name: "twitter:image", content: img },
            ]
          : []),
      ],
      links: [{ rel: "canonical", href: productPath }],
    };
  },
  notFoundComponent: () => (
    <div className="grid min-h-screen place-items-center text-muted-foreground">
      ဤပစ္စည်းကို မရရှိနိုင်ပါ။
    </div>
  ),
  component: ProductPage,
});

function ProductPage() {
  const { product: p } = Route.useLoaderData();
  if (!p) return null;

  const imageSrc = p.image_url ? productImageUrl(p.code, p.image_url) : null;
  const messengerUrl =
    p.messenger_username && p.stock > 0
      ? `https://m.me/${p.messenger_username}?text=${encodeURIComponent(`${p.code} 1`)}`
      : null;

  return (
    <div className="min-h-screen bg-background">
      <main className="mx-auto grid max-w-6xl gap-6 px-4 py-6 sm:px-6 sm:py-10 md:grid-cols-2 md:gap-10">
        <div className="md:col-span-2">
          <Link
            to="/shop"
            className="inline-flex min-h-11 items-center gap-2 rounded-lg px-2 font-semibold text-primary transition-colors hover:bg-secondary"
          >
            <ArrowLeft className="size-5" />
            ပစ္စည်းစာရင်းသို့ ပြန်သွားမည်
          </Link>
        </div>

        <section aria-label="ပစ္စည်းဓာတ်ပုံ" className="min-w-0">
          {imageSrc ? (
            <Dialog>
              <DialogTrigger asChild>
                <button
                  type="button"
                  className="group relative block w-full cursor-zoom-in overflow-hidden rounded-3xl border bg-muted/40 p-2 text-left focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/40"
                  aria-label={`${p.name} ပုံကို အပြည့်ကြည့်ရန်`}
                >
                  <img
                    src={imageSrc}
                    alt={p.name}
                    className="aspect-square w-full rounded-2xl bg-white object-contain"
                  />
                  <span className="absolute bottom-4 right-4 inline-flex items-center gap-2 rounded-full bg-black/75 px-4 py-2 text-sm font-semibold text-white shadow-lg transition-colors group-hover:bg-black">
                    <Maximize2 className="size-4" />
                    ပုံကြီးကြည့်ရန်
                  </span>
                </button>
              </DialogTrigger>
              <DialogContent className="max-h-[95vh] w-[calc(100vw-1rem)] max-w-6xl overflow-hidden border-0 bg-black/95 p-2 text-white sm:p-3">
                <DialogTitle className="sr-only">{p.name} — ပုံအပြည့်အစုံ</DialogTitle>
                <DialogDescription className="sr-only">
                  ပစ္စည်းဓာတ်ပုံကို အပြည့်အစုံကြည့်နေပါသည်။
                </DialogDescription>
                <img
                  src={imageSrc}
                  alt={p.name}
                  className="mx-auto max-h-[84vh] w-full object-contain"
                />
              </DialogContent>
            </Dialog>
          ) : (
            <div className="grid aspect-square place-items-center rounded-3xl border bg-muted text-muted-foreground">
              ပစ္စည်းဓာတ်ပုံ မရှိသေးပါ။
            </div>
          )}
          {imageSrc && (
            <p className="mt-2 text-center text-sm text-muted-foreground">
              ဓာတ်ပုံကိုနှိပ်ပြီး ပုံကြီးကြည့်နိုင်ပါတယ်။
            </p>
          )}
        </section>

        <section className="flex min-w-0 flex-col justify-center gap-5">
          <div className="text-sm font-semibold uppercase tracking-widest text-primary">
            {p.shop_name ?? "ဈေးဆိုင်"}
            {p.category && p.category !== "General" ? ` · ${p.category}` : ""}
          </div>
          <h1 className="break-words text-3xl font-extrabold sm:text-4xl md:text-5xl">{p.name}</h1>
          <div className="font-display text-3xl font-bold">
            ဈေးနှုန်း: {money(p.price, p.currency)}
          </div>
          <div className="flex flex-wrap gap-3 text-sm">
            <span className="rounded-full bg-emerald-50 px-3 py-1 font-semibold text-emerald-700">
              ရောင်းပြီး: {p.sold_count ?? 0} {p.unit}
            </span>
            <span className="rounded-full bg-secondary px-3 py-1">
              လက်ကျန်: {p.stock} {p.unit}
            </span>
          </div>
          {p.stock <= 0 && <div className="font-semibold text-destructive">လက်ကျန်ကုန်ပြီ</div>}
          {p.description && (
            <div className="rounded-2xl border bg-card p-4 sm:p-5">
              <h2 className="mb-2 font-bold">ပစ္စည်းအချက်အလက်</h2>
              <p className="whitespace-pre-line leading-7 text-muted-foreground">{p.description}</p>
            </div>
          )}
          {p.stock > 0 && (
            <div className="rounded-xl bg-secondary p-4 text-sm leading-6">
              ပစ္စည်း Code <b className="font-mono text-lg">{p.code}</b> — Messenger မှာ
              အော်ဒါတင်ရန်
              <b> {p.code} 1</b> လို့ ပို့ပါ။
            </div>
          )}
          {p.stock > 0 && !p.messenger_username && (
            <p className="text-sm text-muted-foreground">
              Messenger မှာမှာယူရန် ဆိုင်၏ Page username ကို ဆိုင်ရှင်ထံမှ ရယူပါ။
            </p>
          )}
          {messengerUrl && (
            <Button
              asChild
              size="lg"
              className="w-full bg-accent text-accent-foreground hover:bg-accent/90"
            >
              <a href={messengerUrl} target="_blank" rel="noreferrer">
                <MessageCircle /> Messenger မှ အော်ဒါတင်မည်
              </a>
            </Button>
          )}
        </section>
      </main>
    </div>
  );
}
