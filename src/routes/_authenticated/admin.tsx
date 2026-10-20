import { createFileRoute, Link, Outlet, useNavigate } from "@tanstack/react-router";
import { BarChart3, Package, ShoppingBag, MapPin, History, Settings, LogOut } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/admin")({
  head: () => ({
    meta: [
      { title: "Shop Dashboard — Messenger Shop" },
      { name: "description", content: "Manage your shop." },
      { property: "og:title", content: "Shop Dashboard — Messenger Shop" },
      { property: "og:description", content: "Manage your shop." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AdminLayout,
});

const nav = [
  { to: "/admin", label: "Sales Reports", icon: BarChart3, exact: true },
  { to: "/admin/products", label: "Products", icon: Package },
  { to: "/admin/orders", label: "Shop Orders", icon: ShoppingBag },
  { to: "/admin/addresses", label: "Delivery Addresses", icon: MapPin },
  { to: "/admin/stock", label: "Stock History", icon: History },
  { to: "/admin/settings", label: "Settings & PIN", icon: Settings },
] as const;

function AdminLayout() {
  const { user } = Route.useRouteContext();
  const navigate = useNavigate();
  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <aside className="no-print flex shrink-0 flex-col bg-sidebar text-sidebar-foreground md:w-60">
        <div className="px-5 py-5 font-display text-lg font-bold">Messenger Shop</div>
        <nav className="flex gap-1 overflow-x-auto px-3 pb-3 md:flex-col">
          {nav.map((n) => (
            <Link
              key={n.to}
              to={n.to}
              activeOptions={{ exact: "exact" in n }}
              className="flex items-center gap-3 whitespace-nowrap rounded-lg px-3 py-2 text-sm opacity-80 hover:bg-sidebar-accent hover:opacity-100"
              activeProps={{ className: "bg-sidebar-accent !opacity-100 text-sidebar-primary" }}
            >
              <n.icon className="size-4" /> {n.label}
            </Link>
          ))}
        </nav>
        <div className="mt-auto hidden border-t border-sidebar-border p-4 text-xs md:block">
          <div className="opacity-70">{(user.user_metadata as { username?: string })?.username ?? "admin"}</div>
          <button
            className="mt-2 flex items-center gap-2 opacity-80 hover:opacity-100"
            onClick={async () => { await supabase.auth.signOut(); navigate({ to: "/auth" }); }}
          >
            <LogOut className="size-3" /> Sign out
          </button>
        </div>
      </aside>
      <main className="flex-1 overflow-x-auto p-4 md:p-8"><Outlet /></main>
    </div>
  );
}
