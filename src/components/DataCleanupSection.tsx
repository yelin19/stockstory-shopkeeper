import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { localInclusiveDateRange } from "@/lib/local-date-range";

type Dataset = "orders" | "stock_history";
type Action = "preview" | "delete";
type Preview = {
  start_at: string;
  end_at: string;
  start_date: string;
  end_date: string;
  record_count: number;
  protected_count: number;
};
type ApiResult = {
  error?: string;
  eligible_count?: number;
  protected_count?: number;
  record_count?: number;
  deleted_count?: number;
};

const datasetCopy: Record<
  Dataset,
  { title: string; description: string; warning: string; noun: string }
> = {
  orders: {
    title: "အော်ဒါမှတ်တမ်း",
    description:
      "ပယ်ဖျက်ပြီးသား သို့မဟုတ် ပို့ဆောင်ပြီးသော အော်ဒါများကိုသာ ဖျက်ပါမည်။ လုပ်ဆောင်နေဆဲအော်ဒါများကို ကာကွယ်ထားပါမည်။",
    warning:
      "ဖျက်လိုက်သော အော်ဒါကို ပြန်ယူ၍မရပါ။ လက်ရှိပစ္စည်းလက်ကျန်နှင့် လက်ကျန်မှတ်တမ်းကို မပြောင်းလဲပါ။ လက်ကျန်မှတ်တမ်းကို ဖျက်လိုပါက အောက်ပါအပိုင်းတွင် သီးခြားလုပ်ဆောင်ပါ။",
    noun: "အော်ဒါ",
  },
  stock_history: {
    title: "လက်ကျန်အဝင်/အထွက်မှတ်တမ်း",
    description: "ရွေးထားသောရက်များအတွင်းရှိ လက်ကျန်ပြောင်းလဲမှုမှတ်တမ်းများကို ဖျက်ပါမည်။",
    warning:
      "မှတ်တမ်းကို ဖျက်ခြင်းသာဖြစ်ပြီး လက်ရှိပစ္စည်းလက်ကျန်ပမာဏနှင့် အော်ဒါမှတ်တမ်းကို မပြောင်းလဲပါ။ ဖျက်လိုက်သောမှတ်တမ်းကို ပြန်ယူ၍မရပါ။",
    noun: "မှတ်တမ်း",
  },
};

function countText(value: number) {
  return value.toLocaleString("my-MM");
}

function CleanupDateRangeCard({ dataset }: { dataset: Dataset }) {
  const qc = useQueryClient();
  const copy = datasetCopy[dataset];
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [busy, setBusy] = useState<Action | null>(null);

  function changeStart(value: string) {
    setStartDate(value);
    setPreview(null);
  }

  function changeEnd(value: string) {
    setEndDate(value);
    setPreview(null);
  }

  async function send(
    action: Action,
    range: { start_at: string; end_at: string },
    expectedCount?: number,
  ) {
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    if (!token) throw new Error("အကောင့်ဝင်ထားရန်လိုပါသည်။ ပြန်ဝင်ပြီး ထပ်စမ်းပါ။");

    const response = await fetch("/api/admin/data-cleanup", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify({
        action,
        dataset,
        ...range,
        ...(action === "delete" ? { expected_count: expectedCount } : {}),
      }),
    });
    const result = (await response.json().catch(() => ({}))) as ApiResult;
    if (!response.ok) {
      if (response.status === 409)
        throw new Error("ဒေတာအရေအတွက် ပြောင်းသွားပါပြီ။ မဖျက်ရသေးပါ။ အရေအတွက်ကို ပြန်စစ်ပါ။");
      throw new Error(result.error || "တောင်းဆိုမှု မအောင်မြင်ပါ။ ခဏနေပြီး ထပ်စမ်းပါ။");
    }
    return result;
  }

  async function previewRange() {
    const range = localInclusiveDateRange(startDate, endDate);
    if (!range)
      return void toast.error(
        "စတင်ရက်နဲ့ ဆုံးရက်ကို မှန်ကန်စွာရွေးပါ။ စတင်ရက်သည် ဆုံးရက်ထက် နောက်မကျရပါ။",
      );

    setBusy("preview");
    try {
      const result = await send("preview", range);
      setPreview({
        ...range,
        start_date: startDate,
        end_date: endDate,
        record_count:
          dataset === "orders"
            ? Number(result.eligible_count ?? 0)
            : Number(result.record_count ?? 0),
        protected_count: Number(result.protected_count ?? 0),
      });
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function deleteRange() {
    if (!preview || preview.record_count < 1 || busy) return;
    const objectName =
      dataset === "orders"
        ? "ပယ်ဖျက်ပြီးသား/ပို့ဆောင်ပြီးသော အော်ဒါ"
        : "လက်ကျန်ပြောင်းလဲမှုမှတ်တမ်း";
    const confirmed = window.confirm(
      `${preview.start_date} မှ ${preview.end_date} အတွင်းရှိ ${countText(preview.record_count)} ခုသော ${objectName} ကို အပြီးဖျက်မလား?\n\n${copy.warning}`,
    );
    if (!confirmed) return;

    setBusy("delete");
    try {
      const result = await send(
        "delete",
        { start_at: preview.start_at, end_at: preview.end_at },
        preview.record_count,
      );
      const deletedCount = Number(result.deleted_count ?? 0);
      toast.success(`${countText(deletedCount)} ခုသော ${copy.noun} မှတ်တမ်းကို ဖျက်ပြီးပါပြီ။`);
      setPreview(null);
      void qc.invalidateQueries();
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-3 rounded-xl border bg-background p-4">
      <div>
        <h3 className="font-semibold">{copy.title} — ရက်စွဲအလိုက်ဖျက်ရန်</h3>
        <p className="mt-1 text-sm text-muted-foreground">{copy.description}</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="space-y-1 text-sm">
          <span>စတင်ရက်</span>
          <Input
            type="date"
            value={startDate}
            onChange={(event) => changeStart(event.target.value)}
            disabled={busy !== null}
          />
        </label>
        <label className="space-y-1 text-sm">
          <span>ဆုံးရက်</span>
          <Input
            type="date"
            value={endDate}
            onChange={(event) => changeEnd(event.target.value)}
            disabled={busy !== null}
          />
        </label>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={previewRange}
          disabled={!startDate || !endDate || busy !== null}
        >
          {busy === "preview" ? "အရေအတွက်စစ်နေသည်..." : "ဖျက်မည့်အရေအတွက်ကြည့်မည်"}
        </Button>
        <Button
          type="button"
          variant="destructive"
          onClick={deleteRange}
          disabled={!preview || preview.record_count < 1 || busy !== null}
        >
          <Trash2 /> {busy === "delete" ? "ဖျက်နေသည်..." : "ရွေးထားသောရက်များကို ဖျက်မည်"}
        </Button>
      </div>
      {preview && (
        <div className="rounded-lg bg-muted p-3 text-sm" role="status">
          <p>
            ရက်စွဲအပိုင်းအခြား: <b>{preview.start_date}</b> မှ <b>{preview.end_date}</b> အထိ
          </p>
          {dataset === "orders" ? (
            <>
              <p>
                ဖျက်နိုင်သော အော်ဒါ: <b>{countText(preview.record_count)}</b> ခု
              </p>
              {preview.protected_count > 0 && (
                <p>
                  လုပ်ဆောင်နေဆဲဖြစ်၍ ကာကွယ်ထားသော အော်ဒါ:{" "}
                  <b>{countText(preview.protected_count)}</b> ခု
                </p>
              )}
            </>
          ) : (
            <p>
              ဖျက်နိုင်သော လက်ကျန်မှတ်တမ်း: <b>{countText(preview.record_count)}</b> ခု
            </p>
          )}
          {preview.record_count === 0 && <p className="mt-1">ဖျက်နိုင်မည့်မှတ်တမ်း မရှိပါ။</p>}
          <p className="mt-2 text-xs text-muted-foreground">{copy.warning}</p>
        </div>
      )}
    </div>
  );
}

export function DataCleanupSection() {
  return (
    <section className="space-y-4 rounded-2xl border bg-card p-6">
      <div>
        <h2 className="text-lg font-bold">ဒေတာစီမံခန့်ခွဲခြင်း</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          စတင်ရက်နဲ့ ဆုံးရက်ကို ရွေးပါ။ ရက်နှစ်ရက်လုံး ပါဝင်တွက်ချက်ပါမည်။ အမျိုးအစားတစ်ခုစီကို
          သီးခြားစစ်ပြီး ဖျက်ရပါမည်။
        </p>
      </div>
      <CleanupDateRangeCard dataset="orders" />
      <CleanupDateRangeCard dataset="stock_history" />
    </section>
  );
}
