import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { MessageCircle, Package, FileSpreadsheet } from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Messenger Shop — Sell and take orders on Messenger" },
      { name: "description", content: "Manage products and stock, and take customer orders straight from Facebook Messenger." },
      { property: "og:title", content: "Messenger Shop — Sell and take orders on Messenger" },
      { property: "og:description", content: "Manage products and stock, and take customer orders straight from Facebook Messenger." },
    ],
  }),
  component: Index,
});

function Index() {
  return (
    <div className="min-h-screen bg-sidebar text-sidebar-foreground">
      <div className="mx-auto flex max-w-5xl flex-col gap-16 px-6 py-20">
        <header className="flex items-center justify-between">
          <span className="font-display text-xl font-bold">Messenger Shop</span>
          <Button asChild variant="secondary"><Link to="/auth">Admin login</Link></Button>
        </header>
        <div className="max-w-2xl space-y-6">
          <h1 className="text-5xl font-extrabold leading-[1.05] md:text-6xl">
            Customers send a code.<br /><span className="text-sidebar-primary">You ship the order.</span>
          </h1>
          <p className="text-lg opacity-80">Product codes, PIN-protected Messenger ordering, live stock and delivery exports — in one place.</p>
          <Button asChild size="lg" className="bg-sidebar-primary text-sidebar-primary-foreground hover:bg-sidebar-primary/90"><Link to="/admin">Open dashboard</Link></Button>
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          {[
            { i: MessageCircle, t: "Messenger orders", d: "Send 111 or 111=2 — the bot collects the address and confirms." },
            { i: Package, t: "Safe stock", d: "Stock drops only after confirmation. No overselling." },
            { i: FileSpreadsheet, t: "Delivery exports", d: "CSV, Excel and printable lists of unsent orders." },
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
