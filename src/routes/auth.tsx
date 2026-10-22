import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { usernameToEmail } from "@/lib/messenger-parse";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Store } from "lucide-react";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Shop Admin Login — Messenger Shop" },
      { name: "description", content: "ပစ္စည်းများ၊ လက်ကျန်နှင့် Messenger အော်ဒါများကို စီမံရန် ဝင်ပါ။" },
      { property: "og:title", content: "Shop Admin Login — Messenger Shop" },
      { property: "og:description", content: "ပစ္စည်းများ၊ လက်ကျန်နှင့် Messenger အော်ဒါများကို စီမံရန် ဝင်ပါ။" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const nav = useNavigate();
  const [mode, setMode] = useState<"in" | "up">("in");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!/^[a-zA-Z0-9._-]{3,30}$/.test(username.trim())) return void toast.error("အသုံးပြုသူအမည်သည် အက္ခရာ/ဂဏန်း ၃-၃၀ လုံးဖြစ်ရမည်");
    if (password.length < 8) return void toast.error("စကားဝှက်သည် အနည်းဆုံး ၈ လုံးရှိရမည်");
    setBusy(true);
    const email = usernameToEmail(username);
    const { error } =
      mode === "in"
        ? await supabase.auth.signInWithPassword({ email, password })
        : await supabase.auth.signUp({ email, password, options: { data: { username: username.trim() } } });
    setBusy(false);
    if (error) return void toast.error(mode === "in" ? "Wrong username or password" : error.message);
    nav({ to: "/admin" });
  }

  return (
    <div className="grid min-h-screen place-items-center bg-sidebar px-4">
      <form onSubmit={submit} className="w-full max-w-sm space-y-5 rounded-2xl bg-card p-8 shadow-2xl">
        <div className="flex items-center gap-3">
          <div className="grid size-11 place-items-center rounded-xl bg-accent text-accent-foreground"><Store /></div>
          <div>
            <h1 className="text-2xl font-bold">ဈေးဆိုင် Admin</h1>
            <p className="text-sm text-muted-foreground">{mode === "in" ? "Sign in to your shop" : "Create a shop admin account"}</p>
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="u">အသုံးပြုသူအမည်</Label>
          <Input id="u" value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="p">စကားဝှက်</Label>
          <Input id="p" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete={mode === "in" ? "current-password" : "new-password"} />
        </div>
        <Button className="w-full" disabled={busy}>{mode === "in" ? "ဝင်မည်" : "အကောင့်ဖန်တီးမည်"}</Button>
        <button type="button" className="w-full text-sm text-muted-foreground hover:text-foreground" onClick={() => setMode(mode === "in" ? "up" : "in")}>
          {mode === "in" ? "ဈေးဆိုင်အသစ်လား။ Admin အကောင့်ဖန်တီးပါ" : "အကောင့်ရှိပြီးသားလား။ ဝင်မည်"}
        </button>
      </form>
    </div>
  );
}
