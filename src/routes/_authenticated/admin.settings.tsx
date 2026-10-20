import { createFileRoute } from "@tanstack/react-router";
import { useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { settingsQuery } from "@/lib/shop-data";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/_authenticated/admin/settings")({
  loader: ({ context }) => context.queryClient.ensureQueryData(settingsQuery),
  component: SettingsPage,
});

function SettingsPage() {
  const qc = useQueryClient();
  const { data: s } = useSuspenseQuery(settingsQuery);
  const { user } = Route.useRouteContext();
  const [f, setF] = useState({
    shop_name: s?.shop_name ?? "My Shop",
    fb_page_id: s?.fb_page_id ?? "",
    messenger_username: s?.messenger_username ?? "",
    low_stock_threshold: String(s?.low_stock_threshold ?? 5),
  });
  const [pin, setPin] = useState("");
  const webhook = typeof window !== "undefined" ? `${window.location.origin}/api/public/shop-messenger` : "";

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const { error } = await supabase.from("shop_settings").upsert({
      owner_id: user.id,
      shop_name: f.shop_name.trim() || "My Shop",
      fb_page_id: f.fb_page_id.trim() || null,
      messenger_username: f.messenger_username.trim().replace(/^@/, "") || null,
      low_stock_threshold: Math.max(0, parseInt(f.low_stock_threshold, 10) || 0),
      updated_at: new Date().toISOString(),
    });
    if (error) return toast.error(error.code === "23505" ? "That Facebook Page is already linked to another shop" : error.message);
    toast.success("Settings saved");
    qc.invalidateQueries({ queryKey: ["settings"] });
  }
  async function savePin(e: React.FormEvent) {
    e.preventDefault();
    const { error } = await supabase.rpc("set_shop_pin", { _pin: pin });
    if (error) return toast.error(error.message);
    setPin("");
    toast.success("Shop PIN updated. Customers must enter the new PIN.");
    qc.invalidateQueries({ queryKey: ["settings"] });
  }
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });

  return (
    <div className="max-w-2xl space-y-8">
      <h1 className="text-3xl font-bold">Settings & PIN</h1>
      <form onSubmit={savePin} className="space-y-3 rounded-2xl border bg-card p-6">
        <h2 className="text-lg font-bold">Shop PIN</h2>
        <p className="text-sm text-muted-foreground">Customers must type this PIN in Messenger before they can see products or order. {s?.pin_hash ? "A PIN is set." : "No PIN set yet — the bot will not serve customers until you set one."}</p>
        <div className="flex gap-2">
          <Input type="password" inputMode="numeric" placeholder="4–8 digits" value={pin} onChange={(e) => setPin(e.target.value)} />
          <Button>Set PIN</Button>
        </div>
      </form>
      <form onSubmit={save} className="space-y-4 rounded-2xl border bg-card p-6">
        <h2 className="text-lg font-bold">Shop & Messenger</h2>
        <div className="space-y-1"><Label>Shop name</Label><Input value={f.shop_name} onChange={set("shop_name")} /></div>
        <div className="space-y-1"><Label>Facebook Page ID</Label><Input value={f.fb_page_id} onChange={set("fb_page_id")} placeholder="e.g. 1029384756" /></div>
        <div className="space-y-1"><Label>Page username (for m.me order button)</Label><Input value={f.messenger_username} onChange={set("messenger_username")} placeholder="yourshoppage" /></div>
        <div className="space-y-1"><Label>Low-stock warning at</Label><Input type="number" min="0" value={f.low_stock_threshold} onChange={set("low_stock_threshold")} /></div>
        <Button>Save settings</Button>
      </form>
      <div className="space-y-2 rounded-2xl border bg-muted p-6 text-sm">
        <h2 className="text-lg font-bold">Messenger webhook</h2>
        <p>Callback URL for your Facebook App (Messenger → Webhooks), subscribe to <b>messages</b>:</p>
        <code className="block break-all rounded bg-card p-2">{webhook}</code>
      </div>
    </div>
  );
}
