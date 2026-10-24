import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { MessageCircle, Package, FileSpreadsheet } from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { title: "Messenger ဈေးဆိုင် — Messenger မှာ ရောင်းပြီး အော်ဒါလက်ခံပါ" },
      { name: "description", content: "ပစ္စည်းနှင့် လက်ကျန်ကို စီမံပြီး Facebook Messenger မှ တိုက်ရိုက်အော်ဒါလက်ခံပါ။" },
      { property: "og:title", content: "Messenger ဈေးဆိုင် — Messenger မှာ ရောင်းပြီး အော်ဒါလက်ခံပါ" },
      { property: "og:description", content: "ပစ္စည်းနှင့် လက်ကျန်ကို စီမံပြီး Facebook Messenger မှ တိုက်ရိုက်အော်ဒါလက်ခံပါ။" },
    ],
  }),
  component: Index,
});

function Index() {
  return (
    <div className="min-h-screen bg-sidebar text-sidebar-foreground">
      <div className="mx-auto flex max-w-5xl flex-col gap-16 px-6 py-20">
        <header className="flex items-center justify-between">
          <span className="font-display text-xl font-bold">Messenger ဈေးဆိုင်</span>
          <Button asChild variant="secondary"><Link to="/auth">Admin ဝင်မည်</Link></Button>
        </header>
        <div className="max-w-2xl space-y-6">
          <h1 className="text-5xl font-extrabold leading-[1.05] md:text-6xl">
            ဝယ်သူက Code ပို့သည်။<br /><span className="text-sidebar-primary">သင်က အော်ဒါပို့ဆောင်ပါ။</span>
          </h1>
          <p className="text-lg opacity-80">ပစ္စည်း Code များ၊ PIN လုံခြုံထားသော Messenger အော်ဒါများ၊ လက်ကျန်နှင့် ပို့ဆောင်ရေးစာရင်းများကို တစ်နေရာတည်းတွင် စီမံပါ။</p>
          <Button asChild size="lg" className="bg-sidebar-primary text-sidebar-primary-foreground hover:bg-sidebar-primary/90"><Link to="/admin">Dashboard ဖွင့်မည်</Link></Button>
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          {[
            { i: MessageCircle, t: "Messenger အော်ဒါများ", d: "111 သို့မဟုတ် 111=2 ပို့ပါ — Bot က လိပ်စာတောင်းပြီး အော်ဒါအတည်ပြုပေးမည်။" },
            { i: Package, t: "လုံခြုံသောလက်ကျန်", d: "အတည်ပြုပြီးမှသာ လက်ကျန်လျော့မည်။ အလွန်အကျွံမရောင်းနိုင်ပါ။" },
            { i: FileSpreadsheet, t: "ပို့ဆောင်ရေးစာရင်းထုတ်ယူမှု", d: "မပို့ရသေးသောအော်ဒါများကို CSV၊ Excel နှင့် ပုံနှိပ်စာရင်းအဖြစ် ထုတ်ယူနိုင်သည်။" },
          ].map(({ i: I, t, d }) => (
            <div key={t} className="rounded-2xl bg-sidebar-accent p-6">
              <I className="mb-4 text-sidebar-primary" />
              <h3 className="font-bold">{t}</h3>
              <p className="mt-1 text-sm opacity-75">{d}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
