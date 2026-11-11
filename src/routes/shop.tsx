import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { ShoppingCart, Minus, Plus, MessageCircle, ExternalLink, MapPin } from "lucide-react";
import { getPublicCatalog } from "@/lib/public-shop.functions";
import { productImageUrl } from "@/lib/shop-data";
import { money } from "@/lib/export";
import {
  THAI_PROVINCES_BY_NAME,
  encodeCartAddressLines,
  findThaiProvince,
  sanitizeAddressDetail,
  thaiProvinceLabel,
  thaiProvinceTownship,
  type ThaiAddressData,
} from "@/lib/thai-provinces";
import { Button } from "@/components/ui/button";

type CatalogProduct = Awaited<ReturnType<typeof getPublicCatalog>>["products"][number];

const ADDRESS_STORAGE_PREFIX = "stockstory:cart-address:";

export const Route = createFileRoute("/shop")({
  loader: () => getPublicCatalog(),
  head: ({ loaderData }) => ({
    meta: [
      { title: `${loaderData?.shop.shop_name ?? "ဆိုင်"} — ပစ္စည်းများ` },
      { name: "description", content: "ပစ္စည်းများကို ရွေးချယ်ပြီး Messenger မှာ အော်ဒါတင်ပါ။" },
    ],
  }),
  component: ShopCatalog,
});

function ShopCatalog() {
  const { products, shop } = Route.useLoaderData();
  const [cart, setCart] = useState<Record<string, number>>({});
  const [openCart, setOpenCart] = useState(false);
  const [provinceCode, setProvinceCode] = useState("");
  const [districtCode, setDistrictCode] = useState("");
  const [subdistrictCode, setSubdistrictCode] = useState("");
  const [addressDetail, setAddressDetail] = useState("");
  const [addressData, setAddressData] = useState<ThaiAddressData | null>(null);
  const [addressDataLoading, setAddressDataLoading] = useState(false);
  const [addressDataError, setAddressDataError] = useState(false);
  const [addressHydrated, setAddressHydrated] = useState(false);
  const currency = shop.currency ?? "MMK";
  const storageKey = `${ADDRESS_STORAGE_PREFIX}${shop.owner_id}`;
  const selected = useMemo(() => products.filter((p) => (cart[p.code] ?? 0) > 0), [cart, products]);
  const cartCount = selected.reduce((sum, p) => sum + (cart[p.code] ?? 0), 0);
  const total = selected.reduce((sum, p) => sum + Number(p.price) * (cart[p.code] ?? 0), 0);
  const province = findThaiProvince(provinceCode);
  const districts = useMemo(
    () => addressData?.districts.filter((item) => item.provinceCode === provinceCode) ?? [],
    [addressData, provinceCode],
  );
  const district = districts.find((item) => item.code === districtCode) ?? null;
  const subdistricts = useMemo(
    () =>
      addressData?.subdistricts.filter(
        (item) => item.provinceCode === provinceCode && item.districtCode === districtCode,
      ) ?? [],
    [addressData, districtCode, provinceCode],
  );
  const subdistrict = subdistricts.find((item) => item.code === subdistrictCode) ?? null;
  const cleanAddress = sanitizeAddressDetail(addressDetail);
  const addressReady = Boolean(province && district && subdistrict) && cleanAddress.length >= 3;

  useEffect(() => {
    if (!openCart || addressData) return;
    let cancelled = false;
    setAddressDataLoading(true);
    setAddressDataError(false);
    fetch(`${import.meta.env.BASE_URL}data/thai-addresses.json`)
      .then((response) => {
        if (!response.ok) throw new Error("Could not load Thai address data");
        return response.json() as Promise<ThaiAddressData>;
      })
      .then((data) => {
        if (!cancelled) setAddressData(data);
      })
      .catch(() => {
        if (!cancelled) setAddressDataError(true);
      })
      .finally(() => {
        if (!cancelled) setAddressDataLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [addressData, openCart]);

  // Remember the last delivery address on this device so repeat customers only
  // choose their administrative area once.
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(storageKey);
      if (raw) {
        const saved = JSON.parse(raw) as {
          provinceCode?: unknown;
          districtCode?: unknown;
          subdistrictCode?: unknown;
          addressDetail?: unknown;
        };
        const savedProvince =
          typeof saved.provinceCode === "string" ? findThaiProvince(saved.provinceCode) : null;
        if (savedProvince) setProvinceCode(savedProvince.code);
        if (typeof saved.districtCode === "string") setDistrictCode(saved.districtCode);
        if (typeof saved.subdistrictCode === "string") setSubdistrictCode(saved.subdistrictCode);
        if (typeof saved.addressDetail === "string")
          setAddressDetail(saved.addressDetail.slice(0, 300));
      }
    } catch {
      // Ignore unavailable or corrupt storage; the form still works.
    } finally {
      setAddressHydrated(true);
    }
  }, [storageKey]);

  useEffect(() => {
    if (!addressHydrated) return;
    try {
      if (!provinceCode && !districtCode && !subdistrictCode && !addressDetail)
        window.localStorage.removeItem(storageKey);
      else
        window.localStorage.setItem(
          storageKey,
          JSON.stringify({ provinceCode, districtCode, subdistrictCode, addressDetail }),
        );
    } catch {
      // Private browsing may block storage; ordering must not depend on it.
    }
  }, [addressHydrated, storageKey, provinceCode, districtCode, subdistrictCode, addressDetail]);

  const change = (p: CatalogProduct, delta: number) =>
    setCart((current) => {
      const next = Math.max(0, Math.min(p.stock, (current[p.code] ?? 0) + delta));
      const result = { ...current };
      if (next) result[p.code] = next;
      else delete result[p.code];
      return result;
    });

  const setQuantity = (p: CatalogProduct, value: string) => {
    const parsed = value === "" ? 0 : Number.parseInt(value, 10);
    const next = Number.isFinite(parsed) ? Math.max(0, Math.min(p.stock, parsed)) : 0;
    setCart((current) => {
      const result = { ...current };
      if (next) result[p.code] = next;
      else delete result[p.code];
      return result;
    });
  };

  const messengerUrl = () => {
    const lines = selected.map(
      (p, index) => `${index + 1}. ${p.name} — ${cart[p.code]} ${p.unit} [${p.code}]`,
    );
    const addressLines =
      province && district && subdistrict
        ? encodeCartAddressLines(province, cleanAddress, district, subdistrict)
        : [];
    const payload = [
      "CART_ORDER",
      ...addressLines,
      ...lines,
      "",
      "အော်ဒါတင်ရန် ပို့ပေးပါသည်။",
    ].join("\n");
    return `https://m.me/${String(shop.messenger_username ?? "").replace(/^@/, "")}?text=${encodeURIComponent(payload)}`;
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-10 border-b bg-background/95 px-4 py-4 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold">{shop.shop_name}</h1>
            <p className="text-sm text-muted-foreground">
              ပစ္စည်းရွေးပြီး Messenger မှာ အော်ဒါတင်ပါ
            </p>
          </div>
          <Button
            aria-label={`Cart ထဲတွင် ${cartCount} ခုရှိသည်`}
            onClick={() => setOpenCart(true)}
            className={`h-12 min-w-[132px] rounded-xl px-4 text-base font-bold shadow-md transition-all ${cartCount > 0 ? "bg-blue-600 text-white shadow-blue-200 hover:bg-blue-700 hover:shadow-lg" : "border-2 border-slate-300 bg-white text-slate-700 hover:bg-slate-50"}`}
          >
            <ShoppingCart className="size-5" /> <span>Cart</span>
            <span
              className={`rounded-full px-2.5 py-0.5 text-sm font-black ${cartCount > 0 ? "bg-white text-blue-700" : "bg-slate-100 text-slate-500"}`}
            >
              {cartCount}
            </span>
          </Button>
        </div>
      </header>
      <main className="mx-auto grid max-w-6xl gap-4 px-4 py-6 sm:grid-cols-2 lg:grid-cols-3">
        {products.map((p) => {
          const quantity = cart[p.code] ?? 0;
          return (
            <article
              key={p.code}
              className={`overflow-hidden rounded-2xl border bg-card shadow-sm transition-all ${quantity > 0 ? "border-blue-400 ring-2 ring-blue-100" : ""}`}
            >
              <Link
                to="/shop/$code"
                params={{ code: p.code }}
                className="block"
                aria-label={`${p.name} ဖော်ပြချက်ကြည့်ရန်`}
              >
                <div className="aspect-[4/3] bg-muted">
                  {p.image_url ? (
                    <img
                      src={productImageUrl(p.code, p.image_url)}
                      alt={p.name}
                      className="size-full object-cover"
                    />
                  ) : null}
                </div>
                <div className="px-4 pt-4">
                  <div className="flex justify-between gap-3">
                    <div>
                      <h2 className="font-bold">{p.name}</h2>
                      <p className="text-xs text-muted-foreground">
                        #{p.code}
                        {p.category && p.category !== "General" ? ` · ${p.category}` : ""}
                      </p>
                    </div>
                    <b>{money(p.price, currency)}</b>
                  </div>
                  {p.description && (
                    <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">
                      {p.description}
                    </p>
                  )}
                  <p className="mt-2 text-xs font-medium text-primary">
                    <ExternalLink className="mr-1 inline size-3" />
                    အသေးစိတ်ဖော်ပြချက်ကြည့်ရန်
                  </p>
                </div>
              </Link>
              <div className="space-y-3 p-4 pt-2">
                <div className="flex items-center justify-between gap-2 text-sm">
                  <span>
                    လက်ကျန်: {p.stock} {p.unit}
                  </span>
                  <span className="font-semibold text-emerald-700">
                    ရောင်းပြီး: {p.sold_count ?? 0} {p.unit}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Button
                      size="icon"
                      variant="outline"
                      disabled={!quantity}
                      onClick={() => change(p, -1)}
                    >
                      <Minus />
                    </Button>
                    <input
                      aria-label={`${p.name} အရေအတွက်`}
                      className={`h-9 w-16 rounded-full border text-center text-base font-bold outline-none focus:ring-2 focus:ring-blue-400 ${quantity > 0 ? "border-blue-500 bg-blue-600 text-white" : "bg-muted text-foreground"}`}
                      type="number"
                      inputMode="numeric"
                      min={0}
                      max={p.stock}
                      value={quantity}
                      onChange={(e) => setQuantity(p, e.target.value)}
                    />
                    <Button
                      size="icon"
                      variant="outline"
                      disabled={p.stock <= quantity}
                      onClick={() => change(p, 1)}
                    >
                      <Plus />
                    </Button>
                  </div>
                  <Button disabled={!p.stock} onClick={() => change(p, 1)}>
                    ရွေးမည်
                  </Button>
                </div>
              </div>
            </article>
          );
        })}
      </main>
      {openCart && (
        <div
          className="fixed inset-0 z-20 overflow-y-auto bg-black/40 p-4"
          onClick={() => setOpenCart(false)}
        >
          <section
            className="mx-auto mt-8 max-w-xl rounded-3xl bg-background p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-5 flex items-center justify-between rounded-2xl bg-blue-600 px-5 py-4 text-white">
              <h2 className="text-2xl font-black">🛒 သင့် Cart</h2>
              <span className="rounded-full bg-white px-3 py-1 text-lg font-black text-blue-700">
                {cartCount} ခု
              </span>
            </div>
            {selected.length ? (
              <div className="space-y-3">
                {selected.map((p) => (
                  <div
                    key={p.code}
                    className="flex items-center justify-between gap-3 rounded-xl border-b pb-3 text-base"
                  >
                    <span className="font-semibold">
                      {p.name} × <b className="text-blue-600">{cart[p.code]}</b>
                    </span>
                    <b>{money(Number(p.price) * (cart[p.code] ?? 0), currency)}</b>
                  </div>
                ))}
                <div className="flex justify-between rounded-xl bg-blue-50 px-4 py-3 text-xl font-black text-blue-800">
                  <span>စုစုပေါင်း</span>
                  <span>{money(total, currency)}</span>
                </div>

                <div className="space-y-3 rounded-2xl border border-blue-200 bg-blue-50/60 p-4">
                  <div className="flex items-center gap-2">
                    <MapPin className="size-5 text-blue-700" />
                    <h3 className="text-base font-bold">နေရပ်လိပ်စာ (ที่อยู่จัดส่ง)</h3>
                  </div>
                  <label className="block text-sm font-semibold" htmlFor="province-select">
                    ပြည်နယ် (จังหวัด)
                  </label>
                  <select
                    id="province-select"
                    className="h-11 w-full rounded-xl border border-input bg-background px-3 text-base outline-none focus:ring-2 focus:ring-blue-400"
                    value={provinceCode}
                    onChange={(e) => {
                      setProvinceCode(e.target.value);
                      setDistrictCode("");
                      setSubdistrictCode("");
                    }}
                  >
                    <option value="">— ပြည်နယ်ရွေးပါ —</option>
                    {THAI_PROVINCES_BY_NAME.map((item) => (
                      <option key={item.code} value={item.code}>
                        {thaiProvinceLabel(item)}
                      </option>
                    ))}
                  </select>
                  <label className="block text-sm font-semibold" htmlFor="district-select">
                    အำเภอ / เขต (District)
                  </label>
                  <select
                    id="district-select"
                    className="h-11 w-full rounded-xl border border-input bg-background px-3 text-base outline-none focus:ring-2 focus:ring-blue-400"
                    value={districtCode}
                    disabled={!province || !addressData || addressDataLoading}
                    onChange={(e) => {
                      setDistrictCode(e.target.value);
                      setSubdistrictCode("");
                    }}
                  >
                    <option value="">
                      {province ? "— အำเภอ / เขต ရွေးပါ —" : "— ပြည်နယ်ကို အရင်ရွေးပါ —"}
                    </option>
                    {districts.map((item) => (
                      <option key={item.code} value={item.code}>
                        {item.nameTh} · {item.nameEn}
                      </option>
                    ))}
                  </select>
                  <label className="block text-sm font-semibold" htmlFor="subdistrict-select">
                    ตำบล / แขวง (Subdistrict)
                  </label>
                  <select
                    id="subdistrict-select"
                    className="h-11 w-full rounded-xl border border-input bg-background px-3 text-base outline-none focus:ring-2 focus:ring-blue-400"
                    value={subdistrictCode}
                    disabled={!district || !addressData}
                    onChange={(e) => setSubdistrictCode(e.target.value)}
                  >
                    <option value="">
                      {district ? "— ตำบล / แขวง ရွေးပါ —" : "— အำเภอ / เขต ကို အရင်ရွေးပါ —"}
                    </option>
                    {subdistricts.map((item) => (
                      <option key={item.code} value={item.code}>
                        {item.nameTh} · {item.nameEn}
                      </option>
                    ))}
                  </select>
                  <label className="block text-sm font-semibold" htmlFor="postal-code">
                    รหัสไปรษณีย์ (Postal code)
                  </label>
                  <input
                    id="postal-code"
                    className="h-11 w-full rounded-xl border border-input bg-muted px-3 text-base"
                    value={subdistrict?.postalCode ?? ""}
                    readOnly
                    placeholder="ตำบล / แขวง ရွေးပြီး အလိုအလျောက်ပြပါမည်"
                  />
                  <label className="block text-sm font-semibold" htmlFor="address-detail">
                    လိပ်စာအသေးစိတ် (အိမ်အမှတ် / หมู่ / လမ်း / ซอย)
                  </label>
                  <textarea
                    id="address-detail"
                    className="min-h-[72px] w-full rounded-xl border border-input bg-background px-3 py-2 text-base outline-none focus:ring-2 focus:ring-blue-400"
                    maxLength={300}
                    placeholder="ဥပမာ 123/4 หมู่ 5 ถนนสุขุมวิท ซอย 10"
                    value={addressDetail}
                    onChange={(e) => setAddressDetail(e.target.value)}
                  />
                  {addressDataLoading && (
                    <p className="text-sm text-muted-foreground">
                      ထိုင်းနိုင်ငံ၏ လိပ်စာစာရင်းကို ဖွင့်နေပါသည်…
                    </p>
                  )}
                  {addressDataError && (
                    <p className="text-sm text-destructive">
                      လိပ်စာစာရင်းကို ဖွင့်မရပါ။ အင်တာနက်ချိတ်ဆက်မှုကို စစ်ဆေးပြီး ထပ်ဖွင့်ပါ။
                    </p>
                  )}
                  {addressReady && province && district && subdistrict ? (
                    <p className="text-sm font-medium text-emerald-700">
                      ✓ {thaiProvinceTownship(province)} · {district.nameTh} · {subdistrict.nameTh}{" "}
                      · {subdistrict.postalCode} · {cleanAddress}
                    </p>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      ပြည်နယ်၊ အำเภอ/เขต၊ ตำบล/แขวง နဲ့ လိပ်စာအသေးစိတ်ကို ရွေးဖြည့်ပါ။
                      စာတိုက်ကုဒ်ကို အလိုအလျောက်ဖြည့်ပေးပါမယ်။
                    </p>
                  )}
                </div>

                <Button
                  className="mt-4 h-12 w-full bg-blue-600 text-base font-bold hover:bg-blue-700"
                  disabled={!shop.messenger_username || !addressReady}
                  asChild={Boolean(shop.messenger_username) && addressReady}
                >
                  {shop.messenger_username && addressReady ? (
                    <a href={messengerUrl()} target="_blank" rel="noreferrer">
                      <MessageCircle /> Messenger မှာ အော်ဒါတင်မည်
                    </a>
                  ) : (
                    <span>
                      <MessageCircle /> Messenger မှာ အော်ဒါတင်မည်
                    </span>
                  )}
                </Button>
                {!shop.messenger_username && (
                  <p className="text-sm text-destructive">
                    ဆိုင်၏ Messenger username မသတ်မှတ်ရသေးပါ။
                  </p>
                )}
                {shop.messenger_username && !addressReady && (
                  <p className="text-sm text-muted-foreground">
                    ခရိုင်နဲ့ လိပ်စာအသေးစိတ်ကို အရင်ဖြည့်ပါရှင်။
                  </p>
                )}
              </div>
            ) : (
              <p className="text-muted-foreground">Cart ထဲမှာ ပစ္စည်းမရှိသေးပါ။</p>
            )}
            <Button
              className="mt-4 h-11 w-full"
              variant="outline"
              onClick={() => setOpenCart(false)}
            >
              ပိတ်မည်
            </Button>
          </section>
        </div>
      )}
    </div>
  );
}
