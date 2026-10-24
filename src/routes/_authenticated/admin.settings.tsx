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
  head: () => ({ meta: [
    { title: "Shop Settings and PIN — Messenger Shop" },
    { name: "description", content: "Configure the Messenger shop, Facebook Page and customer PIN." },
    { property: "og:title", content: "Shop Settings and PIN — Messenger Shop" },
    { property: "og:description", content: "Configure the Messenger shop, Facebook Page and customer PIN." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary_large_image" },
    { name: "robots", content: "noindex" },
  ] }),
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
    bank_name: s?.bank_name ?? "",
    bank_account_name: s?.bank_account_name ?? "",
    bank_account_number: s?.bank_account_number ?? "",
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
      bank_name: f.bank_name.trim() || null,
      bank_account_name: f.bank_account_name.trim() || null,
      bank_account_number: f.bank_account_number.trim() || null,
      low_stock_threshold: Math.max(0, parseInt(f.low_stock_threshold, 10) || 0),
      updated_at: new Date().toISOString(),
    });
    if (error) return void toast.error(error.code === "23505" ? "ဤ Facebook Page ကို အခြားဈေးဆိုင်တွင် ချိတ်ထားပြီးပါပြီ" : error.message);
    toast.success("ဆက်တင်များ သိမ်းပြီးပါပြီ");
    qc.invalidateQueries({ queryKey: ["settings"] });
  }
  async function savePin(e: React.FormEvent) {
    e.preventDefault();
    const { error } = await supabase.rpc("set_shop_pin", { _pin: pin });
    if (error) return void toast.error(error.message);
    setPin("");
    toast.success("ဈေးဆိုင် PIN ပြောင်းပြီးပါပြီ။ ဝယ်သူများသည် PIN အသစ်ကို ထည့်ရပါမည်။");
    qc.invalidateQueries({ queryKey: ["settings"] });
  }
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });

  return (
    <div className="max-w-2xl space-y-8">
      <h1 className="text-3xl font-bold">ဆက်တင်များနှင့် PIN</h1>
      <form onSubmit={savePin} className="space-y-3 rounded-2xl border bg-card p-6">
        <h2 className="text-lg font-bold">ဈေးဆိုင် PIN</h2>
        <p className="text-sm text-muted-foreground">ဝယ်သူများသည် ပစ္စည်းကြည့်ရန် သို့မဟုတ် အော်ဒါတင်ရန် Messenger တွင် ဤ PIN ကို အရင်ထည့်ရပါမည်။ {s?.pin_hash ? "PIN သတ်မှတ်ထားပြီးပါပြီ။" : "PIN မသတ်မှတ်ရသေးပါ — PIN သတ်မှတ်ပြီးမှသာ Bot က ဝယ်သူများကို ဝန်ဆောင်မှုပေးပါမည်။"}</p>
        <div className="flex gap-2">
          <Input type="password" inputMode="numeric" placeholder="4–8 digits" value={pin} onChange={(e) => setPin(e.target.value)} />
          <Button>PIN သတ်မှတ်မည်</Button>
        </div>
      </form>
      <form onSubmit={save} className="space-y-4 rounded-2xl border bg-card p-6">
        <h2 className="text-lg font-bold">ဈေးဆိုင်နှင့် Messenger</h2>
        <div className="space-y-1"><Label>ဈေးဆိုင်အမည်</Label><Input value={f.shop_name} onChange={set("shop_name")} /></div>
        <div className="space-y-1"><Label>Facebook Page ID</Label><Input value={f.fb_page_id} onChange={set("fb_page_id")} placeholder="e.g. 1029384756" /></div>
        <div className="space-y-1"><Label>Page username (m.me အော်ဒါခလုတ်အတွက်)</Label><Input value={f.messenger_username} onChange={set("messenger_username")} placeholder="yourshoppage" /></div>
        <div className="border-t pt-4 text-sm font-semibold">ကြိုတင်ငွေလွှဲရန် ဘဏ်အချက်အလက်</div>
        <div className="space-y-1"><Label>ဘဏ်အမည်</Label><Input value={f.bank_name} onChange={set("bank_name")} placeholder="ဥပမာ KBZ" /></div>
        <div className="space-y-1"><Label>အကောင့်အမည်</Label><Input value={f.bank_account_name} onChange={set("bank_account_name")} /></div>
        <div className="space-y-1"><Label>အကောင့်နံပါတ်</Label><Input value={f.bank_account_number} onChange={set("bank_account_number")} /></div>
        <div className="space-y-1"><Label>လက်ကျန်နည်းကြောင်း သတိပေးမည့်အရေအတွက်</Label><Input type="number" min="0" value={f.low_stock_threshold} onChange={set("low_stock_threshold")} /></div>
        <Button>ဆက်တင်များ သိမ်းမည်</Button>
      </form>
      <div className="space-y-2 rounded-2xl border bg-muted p-6 text-sm">
        <h2 className="text-lg font-bold">Messenger Webhook</h2>
        <p>Facebook App (Messenger → Webhooks) တွင် ထည့်ရန် Callback URL — <b>messages</b> ကို subscribe လုပ်ပါ:</p>
        <code className="block break-all rounded bg-card p-2">{webhook}</code>
      </div>
    </div>
  );
}
