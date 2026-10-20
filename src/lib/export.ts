import * as XLSX from "xlsx";

export type Row = Record<string, string | number | null | undefined>;

function download(blob: Blob, filename: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

export function exportCsv(rows: Row[], filename: string) {
  if (!rows.length) return;
  const headers = Object.keys(rows[0] ?? {});
  const esc = (v: unknown) => {
    const s = v == null ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = [headers.join(","), ...rows.map((r) => headers.map((h) => esc(r[h])).join(","))].join("\n");
  download(new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" }), filename);
}

export function exportXlsx(rows: Row[], filename: string, sheet = "Data") {
  if (!rows.length) return;
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), sheet);
  XLSX.writeFile(wb, filename);
}

export const money = (n: number | string) =>
  Number(n).toLocaleString("en-US", { maximumFractionDigits: 2 }) + " Ks";
