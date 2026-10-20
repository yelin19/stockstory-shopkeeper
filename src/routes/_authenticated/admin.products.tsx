import { createFileRoute, Link } from "@tanstack/react-router";
import { useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Plus, PackagePlus, SlidersHorizontal, Pencil, ExternalLink } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { productsQuery, productImageUrl, type Product } from "@/lib/shop-data";
import { money } from "@/lib/export";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export const Route = createFileRoute("/_authenticated/admin/products")({
  loader: ({ context }) => context.queryClient.ensureQueryData(productsQuery),
  component: ProductsPage,
});

function ProductsPage() {
  const { data: products } = useSuspenseQuery(productsQuery);
  const [edit, setEdit] = useState<Product | "new" | null>(null);
  const [stock, setStock] = useState<{ p: Product; mode: "increase" | "adjust" } | null>(null);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Products</h1>
        <Button onClick={() => setEdit("new")}><Plus /> Add product</Button>
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
                  <div className="font-mono text-xs text-muted-foreground">#{p.code} · {p.category}</div>
                  <div className="font-bold">{p.name}</div>
                </div>
                <div className="text-right">
                  <div className="font-bold">{money(p.price)}</div>
                  <div className={`text-sm ${p.stock === 0 ? "text-destructive" : "text-muted-foreground"}`}>{p.stock} in stock</div>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" onClick={() => setStock({ p, mode: "increase" })}><PackagePlus /> Add stock</Button>
                <Button size="sm" variant="outline" onClick={() => setStock({ p, mode: "adjust" })}><SlidersHorizontal /> Adjust</Button>
                <Button size="sm" variant="ghost" onClick={() => setEdit(p)}><Pencil /></Button>
                <Button size="sm" variant="ghost" asChild><Link to="/shop/$code" params={{ code: p.code }} target="_blank"><ExternalLink /></Link></Button>
              </div>
            </div>
          </div>
        ))}
      </div>
      {!products.length && <p className="text-muted-foreground">No products yet. Add your first one.</p>}
      {edit && <ProductDialog product={edit === "new" ? null : edit} onClose={() => setEdit(null)} />}
      {stock && <StockDialog {...stock} onClose={() => setStock(null)} />}
    </div>
  );
}

function ProductDialog({ product, onClose }: { product: Product | null; onClose: () => void }) {
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
    const price = Number(f.price);
    const stock = parseInt(f.stock, 10);
    if (!/^[A-Za-z0-9_-]{1,32}$/.test(f.code)) return void toast.error("Code: letters/numbers only, no spaces");
    if (!f.name.trim() || !(price >= 0)) return void toast.error("Name and a valid price are required");
    if (!product && !(stock >= 0)) return void toast.error("Stock cannot be negative");
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
      if (error) throw error.code === "23505" ? new Error("That product code is already used") : error;
      toast.success("Saved");
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
        <DialogHeader><DialogTitle>{product ? "Edit product" : "New product"}</DialogTitle></DialogHeader>
        <form onSubmit={save} className="grid grid-cols-2 gap-3">
          <div className="space-y-1"><Label>Product code</Label><Input value={f.code} onChange={set("code")} placeholder="111" /></div>
          <div className="space-y-1"><Label>Category</Label><Input value={f.category} onChange={set("category")} /></div>
          <div className="col-span-2 space-y-1"><Label>Name</Label><Input value={f.name} onChange={set("name")} /></div>
          <div className="space-y-1"><Label>Price (Ks)</Label><Input type="number" min="0" step="any" value={f.price} onChange={set("price")} /></div>
          {!product && <div className="space-y-1"><Label>Starting stock</Label><Input type="number" min="0" value={f.stock} onChange={set("stock")} /></div>}
          <div className="col-span-2 space-y-1"><Label>Image</Label><Input type="file" accept="image/*" onChange={(e) => setFile(e.target.files?.[0] ?? null)} /></div>
          <div className="col-span-2 space-y-1"><Label>Description</Label><Textarea value={f.description} onChange={set("description")} /></div>
          <label className="col-span-2 flex items-center gap-2 text-sm"><Switch checked={f.active} onCheckedChange={(v) => setF({ ...f, active: v })} /> Active (visible to customers)</label>
          <Button className="col-span-2" disabled={busy}>Save</Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function StockDialog({ p, mode, onClose }: { p: Product; mode: "increase" | "adjust"; onClose: () => void }) {
  const qc = useQueryClient();
  const [qty, setQty] = useState("");
  const [note, setNote] = useState("");
  async function save(e: React.FormEvent) {
    e.preventDefault();
    const n = parseInt(qty, 10);
    if (!n || (mode === "increase" && n <= 0)) return void toast.error("Enter a valid quantity");
    const { error } = await supabase.rpc("change_stock", { _product_id: p.id, _delta: n, _reason: mode, _note: note });
    if (error) return void toast.error(error.message);
    toast.success("Stock updated");
    qc.invalidateQueries();
    onClose();
  }
  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader><DialogTitle>{mode === "increase" ? "Add stock" : "Manual adjustment"} — {p.name}</DialogTitle></DialogHeader>
        <form onSubmit={save} className="space-y-3">
          <p className="text-sm text-muted-foreground">Current stock: <b>{p.stock}</b></p>
          <div className="space-y-1">
            <Label>{mode === "increase" ? "Units to add" : "Change (use negative to remove, e.g. -2)"}</Label>
            <Input type="number" value={qty} onChange={(e) => setQty(e.target.value)} />
          </div>
          <div className="space-y-1"><Label>Note</Label><Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Optional" /></div>
          <Button className="w-full">Save</Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
