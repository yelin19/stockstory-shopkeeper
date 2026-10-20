import { createFileRoute } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { useState } from "react";
import { format } from "date-fns";
import { FileDown, FileSpreadsheet } from "lucide-react";
import { stockQuery } from "@/lib/shop-data";
import { exportCsv, exportXlsx } from "@/lib/export";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/admin/stock")({
  loader: ({ context }) => context.queryClient.ensureQueryData(stockQuery),
  component: StockPage,
});

const labels: Record<string, string> = { initial: "Created", increase: "Stock added", sale: "Sale", cancel: "Cancelled order", adjust: "Manual adjust" };

function StockPage() {
  const { data } = useSuspenseQuery(stockQuery);
  const [reason, setReason] = useState("");
  const [code, setCode] = useState("");
  const list = data.filter((h) => (!reason || h.reason === reason) && (!code || h.product_code === code));
  const rows = list.map((h) => ({ Date: format(new Date(h.created_at), "yyyy-MM-dd HH:mm"), Code: h.product_code, Type: labels[h.reason], Change: h.change, Balance: h.balance, Note: h.note ?? "" }));
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl font-bold">Stock History</h1>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => exportCsv(rows, "stock-history.csv")}><FileDown /> CSV</Button>
          <Button size="sm" variant="outline" onClick={() => exportXlsx(rows, "stock-history.xlsx")}><FileSpreadsheet /> Excel</Button>
        </div>
      </div>
      <div className="flex gap-2">
        <select className="h-9 rounded-md border bg-card px-2 text-sm" value={reason} onChange={(e) => setReason(e.target.value)}>
          <option value="">All types</option>{Object.entries(labels).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <select className="h-9 rounded-md border bg-card px-2 text-sm" value={code} onChange={(e) => setCode(e.target.value)}>
          <option value="">All products</option>{[...new Set(data.map((h) => h.product_code))].sort().map((c) => <option key={c}>{c}</option>)}
        </select>
      </div>
      <div className="overflow-x-auto rounded-2xl border bg-card">
        <table className="w-full text-sm">
          <thead className="bg-muted text-left"><tr><th className="px-4 py-2">Date</th><th>Product</th><th>Type</th><th className="text-right">Change</th><th className="text-right">Balance</th><th className="px-4">Note</th></tr></thead>
          <tbody>
            {list.map((h) => (
              <tr key={h.id} className="border-t">
                <td className="px-4 py-2 text-muted-foreground">{format(new Date(h.created_at), "MMM d, HH:mm")}</td>
                <td className="font-mono">{h.product_code}</td>
                <td>{labels[h.reason]}</td>
                <td className={`text-right font-semibold ${h.change < 0 ? "text-destructive" : "text-success"}`}>{h.change > 0 ? "+" : ""}{h.change}</td>
                <td className="text-right">{h.balance}</td>
                <td className="px-4 text-muted-foreground">{h.note}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!list.length && <p className="p-4 text-sm text-muted-foreground">No stock movements yet.</p>}
      </div>
    </div>
  );
}
