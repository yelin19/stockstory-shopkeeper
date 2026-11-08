import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type BotReply = { id: string; question: string; answer: string; enabled: boolean; quick_replies: string[] };

export const Route = createFileRoute("/_authenticated/admin/bot")({
  head: () => ({ meta: [
    { title: "Bot စကားပြော — Messenger Shop" },
    { name: "description", content: "သိမ်းထားသော Bot မေးခွန်း၊ အဖြေနှင့် Messenger ရွေးချယ်စရာများကို စီမံရန်" },
    { name: "robots", content: "noindex" },
  ] }),
  component: BotRepliesPage,
});

function BotRepliesPage() {
  const { user } = Route.useRouteContext();
  const [botReplies, setBotReplies] = useState<BotReply[]>([]);
  const [botQuestion, setBotQuestion] = useState("");
  const [botAnswer, setBotAnswer] = useState("");
  const [botChoices, setBotChoices] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;
    void supabase.from("bot_replies").select("id,question,answer,enabled,quick_replies").order("created_at", { ascending: true }).then(async ({ data, error }) => {
      if (!active) return;
      if (error?.code === "PGRST204") {
        const legacy = await supabase.from("bot_replies").select("id,question,answer,enabled").order("created_at", { ascending: true });
        if (legacy.error) toast.error("Bot စကားပြော table ကို ဖတ်မရပါ။ Migration 0024 ကို အသုံးချပါ။");
        else toast.warning("မေးခွန်း/အဖြေကို ဖတ်နိုင်ပါပြီ။ Button များအတွက် Migration 0025 ကို အသုံးချပါ။");
        setBotReplies(((legacy.data ?? []) as Array<Omit<BotReply, "quick_replies">>).map((row) => ({ ...row, quick_replies: [] })));
      } else if (error) {
        toast.error("Bot စကားပြော table ကို ဖတ်မရပါ။ Migration 0024 ကို အသုံးချပါ။");
        setBotReplies([]);
      } else setBotReplies((data ?? []) as BotReply[]);
      setLoading(false);
    });
    return () => { active = false; };
  }, []);

  async function saveBotReply() {
    const question = botQuestion.trim();
    const answer = botAnswer.trim();
    if (!question || !answer) return void toast.error("မေးခွန်းနဲ့ အဖြေ နှစ်ခုလုံး ဖြည့်ပါ");
    setSaving(true);
    const quick_replies = botChoices.split(/[|၊။\n]/).map((choice) => choice.trim()).filter(Boolean).slice(0, 3);
    const { data, error } = await supabase.from("bot_replies").insert({ owner_id: user.id, question, answer, enabled: true, quick_replies }).select("id,question,answer,enabled,quick_replies").single();
    setSaving(false);
    if (error) return void toast.error(error.code === "PGRST205" ? "Database migration 0024 ကို အရင်အသုံးချပါ" : error.code === "PGRST204" ? "Quick Reply Button များအတွက် Database migration 0025 ကို အရင်အသုံးချပါ" : error.message);
    setBotReplies((rows) => [...rows, data as BotReply]);
    setBotQuestion("");
    setBotAnswer("");
    setBotChoices("");
    toast.success("Bot မေးခွန်း/အဖြေ သိမ်းပြီးပါပြီ");
  }

  async function updateBotReply(row: BotReply) {
    const question = row.question.trim();
    const answer = row.answer.trim();
    if (!question || !answer) return void toast.error("မေးခွန်းနဲ့ အဖြေ အလွတ်မထားပါနဲ့");
    const quick_replies = row.quick_replies.map((choice) => choice.trim()).filter(Boolean).slice(0, 3);
    const { error } = await supabase.from("bot_replies").update({ question, answer, quick_replies, updated_at: new Date().toISOString() }).eq("id", row.id);
    if (error) return void toast.error(error.code === "PGRST204" ? "Quick Reply Button များအတွက် Database migration 0025 ကို အရင်အသုံးချပါ" : error.message);
    toast.success("Bot အဖြေ ပြင်ပြီးပါပြီ");
  }

  async function deleteBotReply(id: string) {
    const { error } = await supabase.from("bot_replies").delete().eq("id", id);
    if (error) return void toast.error(error.message);
    setBotReplies((rows) => rows.filter((row) => row.id !== id));
    toast.success("Bot မေးခွန်း/အဖြေ ဖျက်ပြီးပါပြီ");
  }

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Bot စကားပြော ထည့်သွင်းရန်</h1>
        <p className="mt-2 text-muted-foreground">Customer က Messenger မှာ သိမ်းထားတဲ့ မေးခွန်းနဲ့ တူတဲ့စာပို့လာရင် အဖြေကို တိုက်ရိုက်ပြန်ပေးပါမယ်။ Gemini quota မရှိလည်း ဒီအဖြေများ အလုပ်လုပ်ပါမယ်။</p>
      </div>
      <section className="space-y-4 rounded-2xl border bg-card p-6">
        <div className="space-y-2 rounded-xl border p-4">
          <div className="space-y-1"><Label>မေးခွန်း</Label><Input value={botQuestion} onChange={(e) => setBotQuestion(e.target.value)} placeholder="ဥပမာ — နေကောင်းလား" /></div>
          <div className="space-y-1"><Label>အဖြေ</Label><Input value={botAnswer} onChange={(e) => setBotAnswer(e.target.value)} placeholder="ဥပမာ — ကောင်းပါတယ်ရှင်၊ လူကြီးမင်းကော နေကောင်းလား" /></div>
          <div className="space-y-1"><Label>Customer နှိပ်ရွေးမည့်စာများ (အများဆုံး ၃ ခု)</Label><Input value={botChoices} onChange={(e) => setBotChoices(e.target.value)} placeholder="ငွေကြိုလွှဲမယ်၊ အိမ်ရောက်ငွေချေ၊ မဝယ်တော့ဘူး" /><p className="text-xs text-muted-foreground">ရွေးချယ်စရာတစ်ခုချင်းစီကို ၊ သို့မဟုတ် ။ သို့မဟုတ် စာကြောင်းအသစ်ဖြင့် ခွဲရေးပါ။ Messenger တွင် Button အဖြစ် ပေါ်ပါမည်။</p></div>
          <Button type="button" onClick={() => void saveBotReply()} disabled={saving}>{saving ? "သိမ်းနေသည်..." : "သိမ်းမည်"}</Button>
        </div>
      </section>
      <section className="space-y-3 rounded-2xl border bg-card p-6">
        <h2 className="text-lg font-bold">သိမ်းထားသော Bot စကားပြောများ</h2>
        {loading ? <p className="text-sm text-muted-foreground">ဖတ်နေသည်...</p> : botReplies.length === 0 ? <p className="text-sm text-muted-foreground">သိမ်းထားသော မေးခွန်း/အဖြေ မရှိသေးပါ။</p> : botReplies.map((row) => (
          <div key={row.id} className="space-y-2 rounded-xl border p-4">
            <div className="space-y-1"><Label>မေး</Label><Input value={row.question} onChange={(e) => setBotReplies((rows) => rows.map((item) => item.id === row.id ? { ...item, question: e.target.value } : item))} /></div>
            <div className="space-y-1"><Label>အဖြေ</Label><Input value={row.answer} onChange={(e) => setBotReplies((rows) => rows.map((item) => item.id === row.id ? { ...item, answer: e.target.value } : item))} /></div>
            <div className="space-y-1"><Label>ရွေးချယ်စရာများ (အများဆုံး ၃ ခု)</Label><Input value={row.quick_replies.join("၊ ")} onChange={(e) => setBotReplies((rows) => rows.map((item) => item.id === row.id ? { ...item, quick_replies: e.target.value.split(/[|၊။\n]/).map((choice) => choice.trim()).filter(Boolean).slice(0, 3) } : item))} placeholder="ငွေကြိုလွှဲမယ်၊ အိမ်ရောက်ငွေချေ၊ မဝယ်တော့ဘူး" /></div>
            <div className="flex gap-2"><Button type="button" size="sm" onClick={() => void updateBotReply(row)}>ပြင်ပြီးသိမ်းမည်</Button><Button type="button" size="sm" variant="outline" onClick={() => void deleteBotReply(row.id)}>ဖျက်မည်</Button></div>
          </div>
        ))}
      </section>
    </div>
  );
}
