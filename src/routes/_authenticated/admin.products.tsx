import { createFileRoute, Link } from "@tanstack/react-router";
import { useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Plus, PackagePlus, SlidersHorizontal, Pencil, ExternalLink, Copy } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { productsQuery, settingsQuery, productImageUrl, productPageUrl, type Product } from "@/lib/shop-data";
import { money } from "@/lib/export";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export const Route = createFileRoute("/_authenticated/admin/products")({
  head: () => ({ meta: [
    { title: "Shop Products — Messenger Shop" },
    { name: "description", content: "Manage the Messenger shop product catalogue and stock." },
    { property: "og:title", content: "Shop Products — Messenger Shop" },
    { property: "og:description", content: "Manage the Messenger shop product catalogue and stock." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary_large_image" },
    { name: "robots", content: "noindex" },
  ] }),
  loader: ({ context }) => Promise.all([context.queryClient.ensureQueryData(productsQuery), context.queryClient.ensureQueryData(settingsQuery)]),
  component: ProductsPage,
});

function ProductsPage() {
  const { data: products } = useSuspenseQuery(productsQuery);
  const { data: settings } = useSuspenseQuery(settingsQuery);
  const [edit, setEdit] = useState<Product | "new" | null>(null);
  const [stock, setStock] = useState<{ p: Product; mode: "increase" | "adjust" } | null>(null);

  async function copyProductLink(code: string) {
    const link = productPageUrl(code, window.location.origin);
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(link);
      } else {
        const field = document.createElement("textarea");
        field.value = link;
        field.setAttribute("readonly", "true");
        field.style.position = "fixed";
        field.style.opacity = "0";
        document.body.appendChild(field);
        field.select();
        const copied = document.execCommand("copy");
        field.remove();
        if (!copied) throw new Error("Clipboard copy failed");
      }
      toast.success("ပစ္စည်းလင့်ခ်ကို ကူးယူပြီးပါပြီ။ Facebook comment ထဲမှာ ထည့်နိုင်ပါတယ်။");
    } catch {
      toast.error("လင့်ခ်ကူးမရပါ။ ပြန်စမ်းကြည့်ပါ။");
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">ပစ္စည်းများ</h1>
        <Button onClick={() => setEdit("new")}><Plus /> ပစ္စည်းထည့်မည်</Button>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {products.map((p) => (
          <div key={p.id} className={`overflow-hidden rounded-2xl border bg-card ${p.active ? "" : "opacity-60"}`}>
            <div className="aspect-[4/3] bg-muted">
              {p.image_url && <img src={productImageUrl(p.code, p.image_url)} alt={p.name} className="size-full object-cover" />}
            </div>
            <div className="space-y-3 p-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="font-mono text-xs text-muted-foreground">#{p.code}</div>
                  <div className="font-bold">{p.name}</div>
                </div>
                <div className="text-right">
                  <div className="font-bold">{money(p.price, settings?.currency)}</div>
                  <div className={`text-sm ${p.stock === 0 ? "text-destructive" : "text-muted-foreground"}`}>{p.stock} လက်ကျန်</div>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" onClick={() => setStock({ p, mode: "increase" })}><PackagePlus /> လက်ကျန်ထပ်ဖြည့်မည်</Button>
                <Button size="sm" variant="outline" onClick={() => setStock({ p, mode: "adjust" })}><SlidersHorizontal /> လက်ကျန်ပြင်မည်</Button>
                <Button size="sm" variant="ghost" onClick={() => setEdit(p)}><Pencil /></Button>
                <Button size="sm" variant="outline" title="ပစ္စည်းလင့်ခ်ကူးယူမည်" aria-label={`${p.name} ပစ္စည်းလင့်ခ်ကူးယူမည်`} onClick={() => void copyProductLink(p.code)}><Copy /> လင့်ခ်ကူးယူမည်</Button>
                <Button size="sm" variant="ghost" asChild><Link to="/shop/$code" params={{ code: p.code }} target="_blank"><ExternalLink /></Link></Button>
              </div>
            </div>
          </div>
        ))}
      </div>
      {!products.length && <p className="text-muted-foreground">ပစ္စည်းမရှိသေးပါ။ ပထမဆုံးပစ္စည်းကို ထည့်ပါ။</p>}
      {edit && <ProductDialog product={edit === "new" ? null : edit} currency={settings?.currency ?? null} onClose={() => setEdit(null)} />}
      {stock && <StockDialog {...stock} onClose={() => setStock(null)} />}
    </div>
  );
}

function ProductDialog({ product, currency, onClose }: { product: Product | null; currency?: string | null; onClose: () => void }) {
  const qc = useQueryClient();
  const [f, setF] = useState({
    code: product?.code ?? "",
    name: product?.name ?? "",
    category: product?.category ?? "General",
    price: String(product?.price ?? ""),
    stock: "0",
    description: product?.description ?? "",
    active: product?.active ?? true,
  });
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!f.price.trim()) return void toast.error("ဈေးနှုန်းထည့်ရန်လိုအပ်ပါသည် (အခမဲ့ဖြစ်ပါက 0 ဟုထည့်ပါ)");
    const price = Number(f.price);
    const stock = parseInt(f.stock, 10);
    if (!/^[A-Za-z0-9_-]{1,32}$/.test(f.code)) return void toast.error("Code တွင် အက္ခရာ/ဂဏန်းများသာ ထည့်ပါ၊ space မထည့်ပါနှင့်");
    if (!f.name.trim() || !Number.isFinite(price) || !(price >= 0)) return void toast.error("အမည်နှင့် မှန်ကန်သောဈေးနှုန်း ထည့်ရန်လိုပါသည်");
    if (!product && !(stock >= 0)) return void toast.error("အရေအတွက်သည် အနုတ်မဖြစ်ရပါ");
    setBusy(true);
    try {
      let image_url = product?.image_url ?? null;
      if (file) {
        const { data: u } = await supabase.auth.getUser();
        const path = `${u.user!.id}/${crypto.randomUUID()}-${file.name.replace(/[^a-zA-Z0-9.]/g, "")}`;
        const { error } = await supabase.storage.from("product-images").upload(path, file, { contentType: file.type });
        if (error) throw error;
        image_url = path;
      }
      const row = { code: f.code.trim(), name: f.name.trim(), category: f.category.trim() || "General", price, description: f.description, active: f.active, image_url };
      const { error } = product
        ? await supabase.from("products").update(row).eq("id", product.id)
        : await supabase.from("products").insert({ ...row, stock });
      if (error) throw error.code === "23505" ? new Error("ဤပစ္စည်း Code ကို အသုံးပြုပြီးသားပါ") : error;
      toast.success("သိမ်းပြီးပါပြီ");
      qc.invalidateQueries();
      onClose();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader><DialogTitle>{product ? "ပစ္စည်းပြင်မည်" : "ပစ္စည်းအသစ်"}</DialogTitle></DialogHeader>
        <form onSubmit={save} className="grid grid-cols-2 gap-3">
          <div className="space-y-1"><Label>ပစ္စည်း Code</Label><Input value={f.code} onChange={set("code")} placeholder="111" /></div>
          <div className="col-span-2 space-y-1"><Label>အမည်</Label><Input value={f.name} onChange={set("name")} /></div>
          <div className="space-y-1"><Label>ဈေးနှုန်း ({currency === "THB" ? "฿" : "ကျပ်"})</Label><Input type="number" min="0" step="any" required value={f.price} onChange={set("price")} /></div>
          {!product && <div className="space-y-1"><Label>အရေအတွက်</Label><Input type="number" min="0" value={f.stock} onChange={set("stock")} /></div>}
          <div className="col-span-2 space-y-1"><Label>ပုံ</Label><Input type="file" accept="image/*" onChange={(e) => setFile(e.target.files?.[0] ?? null)} /></div>
          <div className="col-span-2 space-y-1"><Label>ဖော်ပြချက်</Label><Textarea value={f.description} onChange={set("description")} /></div>
          <label className="col-span-2 flex items-center gap-2 text-sm"><Switch checked={f.active} onCheckedChange={(v) => setF({ ...f, active: v })} /> ဖွင့်ထားသည် (ဝယ်သူများမြင်ရမည်)</label>
          <Button className="col-span-2" disabled={busy}>သိမ်းမည်</Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

type PendingStockAction = { requestId: string; delta: number; note: string };

function readPendingStockAction(key: string): PendingStockAction | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(key);
    if (!raw) return null;
    const value = JSON.parse(raw) as Partial<PendingStockAction>;
    return typeof value.requestId === "string" && typeof value.delta === "number" && Number.isInteger(value.delta) && typeof value.note === "string"
      ? value as PendingStockAction
      : null;
  } catch {
    return null;
  }
}

function storePendingStockAction(key: string, action: PendingStockAction | null) {
  if (typeof window === "undefined") return;
  try {
    if (action) window.sessionStorage.setItem(key, JSON.stringify(action));
    else window.sessionStorage.removeItem(key);
  } catch {
    // The in-memory retry state still protects the current dialog if storage is unavailable.
  }
}

function StockDialog({ p, mode, onClose }: { p: Product; mode: "increase" | "adjust"; onClose: () => void }) {
  const qc = useQueryClient();
  const storageKey = `shop-stock-action:${p.id}:${mode}`;
  const [initialAction] = useState(() => readPendingStockAction(storageKey));
  const [pendingAction, setPendingAction] = useState<PendingStockAction | null>(initialAction);
  const [qty, setQty] = useState(initialAction ? String(initialAction.delta) : "");
  const [note, setNote] = useState(initialAction?.note ?? "");
  const [saving, setSaving] = useState(false);
  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (saving) return;
    const n = parseInt(qty, 10);
    if (!n || (mode === "increase" && n <= 0)) return void toast.error("မှန်ကန်သောအရေအတွက် ထည့်ပါ");
    const action = pendingAction ?? { requestId: crypto.randomUUID(), delta: n, note };
    if (!pendingAction) {
      setPendingAction(action);
      storePendingStockAction(storageKey, action);
    }
    setSaving(true);
    try {
      const { error } = await supabase.rpc("change_stock", { _product_id: p.id, _delta: action.delta, _reason: mode, _note: action.note, _request_id: action.requestId });
      if (error) {
        const outcomeUnknown = !/^[0-9A-Z]{5}$/.test(error.code);
        if (outcomeUnknown) {
          setPendingAction(action);
          storePendingStockAction(storageKey, action);
          toast.error("ရလဒ်ကို မသေချာပါ။ လက်ကျန်နှစ်ခါမပြောင်းစေရန် ယခုလုပ်ဆောင်ချက်ကို ထပ်စမ်းပါ။");
        } else {
          setPendingAction(null);
          storePendingStockAction(storageKey, null);
          toast.error(error.message);
        }
        return;
      }
      setPendingAction(null);
      storePendingStockAction(storageKey, null);
      let alertFailed = false;
      try {
        const { data: sessionData } = await supabase.auth.getSession();
        const token = sessionData.session?.access_token;
        if (token) {
          const response = await fetch("/api/admin/low-stock-alert", {
            method: "POST",
            headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
            body: JSON.stringify({ product_id: p.id }),
          });
          const result = await response.json() as { failed?: number };
          alertFailed = !response.ok || (result.failed ?? 0) > 0;
        }
      } catch {
        alertFailed = true;
      }
      if (alertFailed) toast.warning("လက်ကျန်ကို သိမ်းပြီးပါပြီ။ Messenger သတိပေးစာ မပို့နိုင်ပါက Dashboard ကို စစ်ပါ။");
      else toast.success("လက်ကျန်ပြင်ပြီးပါပြီ");
      qc.invalidateQueries();
      onClose();
    } catch (err) {
      setPendingAction(action);
      storePendingStockAction(storageKey, action);
      toast.error("ရလဒ်ကို မသေချာပါ။ တူညီသော request ID ဖြင့် ထပ်စမ်းပါ။");
    } finally {
      setSaving(false);
    }
  }
  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader><DialogTitle>{mode === "increase" ? "လက်ကျန်ထပ်ဖြည့်မည်" : "ကိုယ်တိုင်ပြင်ဆင်ခြင်း"} — {p.name}</DialogTitle></DialogHeader>
        <form onSubmit={save} className="space-y-3">
          <p className="text-sm text-muted-foreground">လက်ရှိလက်ကျန်: <b>{p.stock}</b></p>
          <div className="space-y-1">
            <Label>{mode === "increase" ? "ထပ်ဖြည့်မည့်အရေအတွက်" : "ပြောင်းလဲမည့်အရေအတွက် (ဖယ်ရန် -2 ကဲ့သို့ အနုတ်သုံးပါ)"}</Label>
            <Input type="number" value={qty} onChange={(e) => setQty(e.target.value)} disabled={saving || Boolean(pendingAction)} />
          </div>
          <div className="space-y-1"><Label>မှတ်ချက်</Label><Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="မဖြစ်မနေမဟုတ်ပါ" disabled={saving || Boolean(pendingAction)} /></div>
          <Button className="w-full" type="submit" disabled={saving}>{saving ? "သိမ်းနေသည်..." : pendingAction ? "တူညီသောလုပ်ဆောင်ချက်ကို ထပ်စမ်းမည်" : "သိမ်းမည်"}</Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
