import { createFileRoute } from "@tanstack/react-router";
import { useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { settingsQuery } from "@/lib/shop-data";
import type { ShopCurrency } from "@/lib/currency";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/_authenticated/admin/settings")({
  head: () => ({ meta: [
    { title: "Shop Settings — Messenger Shop" },
    { name: "description", content: "Configure the Messenger shop and Facebook Page." },
    { property: "og:title", content: "Shop Settings — Messenger Shop" },
    { property: "og:description", content: "Configure the Messenger shop and Facebook Page." },
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
    currency: s?.currency === "THB" ? "THB" : "MMK",
    fb_page_id: s?.fb_page_id ?? "",
    messenger_username: s?.messenger_username ?? "",
    bank_name: s?.bank_name ?? "",
    bank_account_name: s?.bank_account_name ?? "",
    bank_account_number: s?.bank_account_number ?? "",
    low_stock_threshold: String(s?.low_stock_threshold ?? 5),
  });
  const [alertPin, setAlertPin] = useState("");
  const [savingAlertPin, setSavingAlertPin] = useState(false);
  const webhook = typeof window !== "undefined" ? `${window.location.origin}/api/public/shop-messenger` : "";

  async function processPendingAlerts() {
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) return false;
      const response = await fetch("/api/admin/low-stock-alert", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
        body: JSON.stringify({}),
      });
      const result = await response.json() as { failed?: number };
      return response.ok && (result.failed ?? 0) === 0;
    } catch {
      return false;
    }
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const baseValues = {
      owner_id: user.id,
      shop_name: f.shop_name.trim() || "My Shop",
      fb_page_id: f.fb_page_id.trim() || null,
      messenger_username: f.messenger_username.trim().replace(/^@/, "") || null,
      bank_name: f.bank_name.trim() || null,
      bank_account_name: f.bank_account_name.trim() || null,
      bank_account_number: f.bank_account_number.trim() || null,
      low_stock_threshold: Math.max(0, parseInt(f.low_stock_threshold, 10) || 0),
      updated_at: new Date().toISOString(),
    };
    const { error } = await supabase.from("shop_settings").upsert({ ...baseValues, currency: f.currency });
    if (error && ["42703", "PGRST204"].includes(error.code)) {
      const { error: legacyError } = await supabase.from("shop_settings").upsert(baseValues);
      if (legacyError) return void toast.error(legacyError.code === "23505" ? "ဤ Facebook Page ကို အခြားဈေးဆိုင်တွင် ချိတ်ထားပြီးပါပြီ" : legacyError.message);
      toast.warning("အခြားဆက်တင်များ သိမ်းပြီးပါပြီ။ ငွေကြေးပြောင်းရန် database migration 0015 ကို အရင်အသုံးချပါ။");
      qc.invalidateQueries({ queryKey: ["settings"] });
      return;
    }
    if (error) return void toast.error(error.code === "23505" ? "ဤ Facebook Page ကို အခြားဈေးဆိုင်တွင် ချိတ်ထားပြီးပါပြီ" : error.message);
    toast.success("ဆက်တင်များ သိမ်းပြီးပါပြီ");
    qc.invalidateQueries({ queryKey: ["settings"] });
    if (!await processPendingAlerts()) toast.warning("Messenger သတိပေးစာ မပို့နိုင်ပါက Dashboard ကို စစ်ပါ");
  }
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });

  async function saveAlertPin() {
    if (!/^\d{6,8}$/.test(alertPin)) return void toast.error("၆ မှ ၈ လုံးအထိ ဂဏန်း PIN ထည့်ပါ");
    setSavingAlertPin(true);
    const { error } = await supabase.rpc("set_low_stock_alert_pin", { _pin: alertPin });
    setSavingAlertPin(false);
    if (error) return void toast.error(error.code === "PGRST202" ? "Messenger သတိပေးစနစ်အတွက် SQL migration 0016 ကို အရင် run လုပ်ပါ" : error.message);
    setAlertPin("");
    toast.success("PIN သတ်မှတ်ပြီးပါပြီ။ ယခင် Messenger အကောင့်ကို ဖြုတ်ထားပါသည်");
    qc.invalidateQueries({ queryKey: ["settings"] });
  }

  return (
    <div className="max-w-2xl space-y-8">
      <h1 className="text-3xl font-bold">ဆက်တင်များနှင့် Messenger</h1>
      <form onSubmit={save} className="space-y-4 rounded-2xl border bg-card p-6">
        <h2 className="text-lg font-bold">ဈေးဆိုင်နှင့် Messenger</h2>
        <div className="space-y-1"><Label>ဈေးဆိုင်အမည်</Label><Input value={f.shop_name} onChange={set("shop_name")} /></div>
        <div className="space-y-1">
          <Label htmlFor="shop-currency">ဈေးနှုန်းသုံးငွေကြေး</Label>
          <select id="shop-currency" className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={f.currency} onChange={(e) => setF({ ...f, currency: e.target.value as ShopCurrency })}>
            <option value="MMK">ကျပ် (MMK)</option>
            <option value="THB">ဘတ် (THB)</option>
          </select>
          <p className="text-xs text-muted-foreground">ရွေးထားသောငွေကြေးသည် ပစ္စည်းများ၊ အော်ဒါစာရင်းနှင့် Messenger စာများတွင် အသုံးပြုပါမည်။ ငွေကြေးပြောင်းလဲခြင်းကြောင့် ဈေးနှုန်းကို အလိုအလျောက်လဲလှယ်မည်မဟုတ်ပါ။</p>
        </div>
        <div className="space-y-1"><Label>Facebook Page ID</Label><Input value={f.fb_page_id} onChange={set("fb_page_id")} placeholder="e.g. 1029384756" /></div>
        <div className="space-y-1"><Label>Page username (m.me အော်ဒါခလုတ်အတွက်)</Label><Input value={f.messenger_username} onChange={set("messenger_username")} placeholder="yourshoppage" /></div>
        <div className="border-t pt-4 text-sm font-semibold">ကြိုတင်ငွေလွှဲရန် ဘဏ်အချက်အလက်</div>
        <div className="space-y-1"><Label>ဘဏ်အမည်</Label><Input value={f.bank_name} onChange={set("bank_name")} placeholder="ဥပမာ KBZ" /></div>
        <div className="space-y-1"><Label>အကောင့်အမည်</Label><Input value={f.bank_account_name} onChange={set("bank_account_name")} /></div>
        <div className="space-y-1"><Label>အကောင့်နံပါတ်</Label><Input value={f.bank_account_number} onChange={set("bank_account_number")} /></div>
        <div className="space-y-1"><Label>လက်ကျန်နည်းကြောင်း သတိပေးမည့်အရေအတွက်</Label><Input type="number" min="0" value={f.low_stock_threshold} onChange={set("low_stock_threshold")} /></div>
        <Button>ဆက်တင်များ သိမ်းမည်</Button>
      </form>
      <section className="space-y-3 rounded-2xl border bg-card p-6">
        <div>
          <h2 className="text-lg font-bold">လက်ကျန်နည်းသတိပေးစာ လက်ခံမည့် Messenger</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {s?.low_stock_alert_psid ? "Messenger အကောင့်တစ်ခု ချိတ်ဆက်ထားပါသည်။" : "Messenger အကောင့် မချိတ်ဆက်ရသေးပါ။"}
            {s?.low_stock_alert_pin_hash ? " PIN ပို့ပြီး အကောင့်ချိတ်ရန် စောင့်နေပါသည်။" : ""}
          </p>
        </div>
        <div className="space-y-1">
          <Label htmlFor="low-stock-alert-pin">Messenger ချိတ်ဆက်ရန် PIN (၆–၈ လုံး)</Label>
          <Input id="low-stock-alert-pin" type="password" inputMode="numeric" autoComplete="new-password" maxLength={8} value={alertPin} onChange={(e) => setAlertPin(e.target.value.replace(/\D/g, ""))} placeholder="ဥပမာ 123456" />
        </div>
        <Button type="button" onClick={saveAlertPin} disabled={savingAlertPin}>{savingAlertPin ? "သိမ်းနေသည်..." : "PIN သတ်မှတ်မည်"}</Button>
        {s?.low_stock_alert_pin_hash && !s?.low_stock_alert_psid && <div className="space-y-1 text-sm">
          <p>PIN သတ်မှတ်ပြီးပါက လက်ခံစေလိုသော Messenger အကောင့်မှ ဆိုင် Page ကိုဖွင့်ပြီး <b>PIN 123456</b> ပုံစံဖြင့် ပို့ပါ။ အဲဒီအကောင့်ကို သတိပေးစာလက်ခံမည့်အကောင့်အဖြစ် ချိတ်ပါမည်။ PIN ကို တစ်ကြိမ်သာ အသုံးပြုနိုင်ပါသည်။</p>
          {f.messenger_username.trim() && <a className="font-semibold text-primary underline" href={`https://m.me/${encodeURIComponent(f.messenger_username.trim().replace(/^@/, ""))}`} target="_blank" rel="noreferrer">ဆိုင် Page Messenger ကိုဖွင့်ရန်</a>}
        </div>}
        <p className="text-xs text-muted-foreground">Messenger က ပုံမှန်အားဖြင့် အကောင့်က Page ဆီ စာပို့ပြီး ၂၄ နာရီအတွင်းသာ မက်ဆေ့ခ်ျပို့ခွင့်ပေးနိုင်ပါသည်။ အဲဒီအချိန်ကျော်လို့ မပို့နိုင်ပါက လက်ကျန်နည်းစာရင်းကို Dashboard မှာ ဆက်မြင်နိုင်ပြီး၊ လက်ခံမည့်အကောင့်က Page ဆီ ထပ်စာပို့ပါက ပြန်ပို့ရန် ကြိုးစားပါမည်။</p>
        <Button type="button" variant="outline" onClick={() => qc.invalidateQueries({ queryKey: ["settings"] })}>ချိတ်ဆက်မှုအခြေအနေ ပြန်စစ်ရန်</Button>
      </section>
      <div className="space-y-2 rounded-2xl border bg-muted p-6 text-sm">
        <h2 className="text-lg font-bold">Messenger Webhook</h2>
        <p>Facebook App (Messenger → Webhooks) တွင် ထည့်ရန် Callback URL — <b>messages</b> ကို subscribe လုပ်ပါ:</p>
        <code className="block break-all rounded bg-card p-2">{webhook}</code>
      </div>
    </div>
  );
}
