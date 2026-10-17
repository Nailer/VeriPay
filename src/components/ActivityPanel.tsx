"use client";

import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import { Download, Loader2, ArrowUpRight, AlertTriangle } from "lucide-react";
import { usePolling } from "@/lib/usePolling";
import type { ActivityEvent } from "@/lib/activity";

type Activity = {
  generatedAt: string;
  totals: {
    people: number; sellers: number; paymentsStarted: number; paymentsFunded: number;
    orders: number; open: number; paidOut: number; refunded: number; disputed: number;
    lockedNgn: number; paidOutNgn: number; totalNgn: number; feesNgn: number; pageViews7d: number;
  };
  ops: { feeWallet: { address: string; mon: number; buyersLeft: number } | null; gasTopupsSent: number };
  series: { day: string; orders: number; payments: number; sellers: number }[];
  feed: ActivityEvent[];
};

const FILTERS: { key: "all" | ActivityEvent["kind"] | "money"; label: string }[] = [
  { key: "all", label: "Everything" },
  { key: "order", label: "Orders" },
  { key: "money", label: "Payouts & refunds" },
  { key: "payment", label: "Card payments" },
  { key: "seller", label: "Sellers" },
  { key: "signin", label: "Sign-ins" },
];

const naira = (n: number) => `₦${n.toLocaleString("en-NG", { maximumFractionDigits: 0 })}`;
const when = (iso: string) => new Date(iso).toLocaleString("en-NG", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
const card = "p-4 rounded-2xl bg-white dark:bg-zinc-900/50 border border-zinc-200 dark:border-zinc-800";
const micro = "text-[9px] font-black uppercase tracking-widest text-zinc-400";

/**
 * Admin → Activity: a record of who is using VeriPay and what happened —
 * people, sellers, card payments, orders on Monad, payouts — plus the health
 * of the wallet that pays everyone's network fees. Exportable as CSV.
 */
export default function ActivityPanel({ headers }: { headers: () => HeadersInit }) {
  const [data, setData] = useState<Activity | null>(null);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState<(typeof FILTERS)[number]["key"]>("all");
  const [exporting, setExporting] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/activity", { headers: headers() });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Couldn't load activity.");
      setData(d); setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't load activity.");
    }
  }, [headers]);
  usePolling(load, 30_000);

  const exportCsv = async () => {
    setExporting(true);
    try {
      const res = await fetch("/api/admin/activity?format=csv", { headers: headers() });
      const blob = await res.blob();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `veripay-activity-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(a.href);
    } finally {
      setExporting(false);
    }
  };

  const feed = useMemo(() => {
    if (!data) return [];
    if (filter === "all") return data.feed;
    if (filter === "money") return data.feed.filter((e) => e.kind === "release" || e.kind === "refund" || e.kind === "dispute");
    return data.feed.filter((e) => e.kind === filter);
  }, [data, filter]);

  if (error && !data) return <div className="text-center py-16 text-sm text-zinc-500">{error}</div>;
  if (!data) return <div className="flex justify-center py-16"><Loader2 className="w-5 h-5 animate-spin text-zinc-400" /></div>;

  const t = data.totals;
  const peak = Math.max(1, ...data.series.map((s) => s.orders + s.payments + s.sellers));
  const fw = data.ops.feeWallet;

  return (
    <div className="anim-fade-up flex flex-col gap-4">
      {/* Who and how much */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "People", value: t.people, note: "everyone who signed in, paid or sold" },
          { label: "Sellers", value: t.sellers, note: "payment links claimed" },
          { label: "Card payments", value: `${t.paymentsFunded} / ${t.paymentsStarted}`, note: "verified / started" },
          { label: "Orders on Monad", value: t.orders, note: `${t.open} open · ${t.paidOut} paid out` },
          { label: "Held right now", value: naira(t.lockedNgn), note: "naira in open orders" },
          { label: "Paid to sellers", value: naira(t.paidOutNgn), note: "naira released" },
          { label: "Fees earned", value: naira(t.feesNgn), note: "1% on paid-out orders" },
          { label: "Disputes · refunds", value: `${t.disputed} · ${t.refunded}`, note: `${t.pageViews7d} page views in 7 days` },
        ].map((s) => (
          <div key={s.label} className={card}>
            <p className={micro}>{s.label}</p>
            <p className="text-xl font-black text-zinc-900 dark:text-white mt-1.5">{s.value}</p>
            <p className="text-[10px] text-zinc-500 mt-1 leading-snug">{s.note}</p>
          </div>
        ))}
      </div>

      {/* Operations */}
      <div className={`${card} flex flex-col sm:flex-row sm:items-center gap-3`}>
        <div className="flex-1 min-w-0">
          <p className={micro}>Network-fee wallet</p>
          {fw ? (
            <p className="text-sm text-zinc-700 dark:text-zinc-300 mt-1.5 leading-relaxed">
              <span className="font-black text-zinc-900 dark:text-white">{fw.mon.toFixed(2)} MON</span> — enough for about{" "}
              <span className="font-black text-zinc-900 dark:text-white">{fw.buyersLeft} new buyers</span>. {data.ops.gasTopupsSent} fee top-ups sent so far.
              <span className="block font-mono text-[10px] text-zinc-500 mt-0.5 break-all">{fw.address}</span>
            </p>
          ) : <p className="text-sm text-zinc-500 mt-1.5">Couldn&apos;t read the wallet balance.</p>}
        </div>
        {fw && fw.buyersLeft < 10 && (
          <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-zinc-900 dark:bg-white text-white dark:text-black text-xs font-bold">
            <AlertTriangle className="w-4 h-4 shrink-0" /> Top it up from the faucet soon
          </div>
        )}
      </div>

      {/* Last 14 days */}
      <div className={card}>
        <div className="flex items-center justify-between mb-3">
          <p className={micro}>Last 14 days</p>
          <p className="text-[10px] text-zinc-500">orders · verified payments · new sellers</p>
        </div>
        <div className="flex items-end gap-1.5 h-28">
          {data.series.map((s) => {
            const total = s.orders + s.payments + s.sellers;
            return (
              <div key={s.day} className="flex-1 flex flex-col items-center justify-end gap-1 h-full" title={`${s.day}: ${s.orders} orders, ${s.payments} payments, ${s.sellers} sellers`}>
                {total > 0 && <span className="text-[9px] font-bold text-zinc-500">{total}</span>}
                <div className="w-full flex flex-col justify-end rounded-md overflow-hidden" style={{ height: `${(total / peak) * 80}%`, minHeight: total ? 4 : 2 }}>
                  <div className="bg-zinc-900 dark:bg-white" style={{ flex: s.orders }} />
                  <div className="bg-zinc-500" style={{ flex: s.payments }} />
                  <div className="bg-zinc-300 dark:bg-zinc-700" style={{ flex: s.sellers || (total ? 0 : 1) }} />
                </div>
                <span className="text-[8px] text-zinc-400">{s.day.slice(8)}</span>
              </div>
            );
          })}
        </div>
        <div className="flex gap-4 mt-3 text-[10px] text-zinc-500">
          <span className="flex items-center gap-1.5"><i className="w-2.5 h-2.5 rounded-sm bg-zinc-900 dark:bg-white" />Orders</span>
          <span className="flex items-center gap-1.5"><i className="w-2.5 h-2.5 rounded-sm bg-zinc-500" />Payments</span>
          <span className="flex items-center gap-1.5"><i className="w-2.5 h-2.5 rounded-sm bg-zinc-300 dark:bg-zinc-700" />Sellers</span>
        </div>
      </div>

      {/* Feed */}
      <div className={card}>
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-3">
          <p className={`${micro} flex-1`}>Activity record · {feed.length} entries</p>
          <button onClick={exportCsv} disabled={exporting}
            className="flex items-center justify-center gap-2 px-3.5 py-2 rounded-xl border border-zinc-200 dark:border-zinc-800 text-xs font-bold text-zinc-700 dark:text-zinc-300 disabled:opacity-50">
            {exporting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />} Export CSV
          </button>
        </div>
        <div className="flex gap-1.5 overflow-x-auto pb-2 mb-1">
          {FILTERS.map((f) => (
            <button key={f.key} onClick={() => setFilter(f.key)}
              className={`shrink-0 px-3 py-1.5 rounded-full text-[11px] font-bold border ${filter === f.key
                ? "bg-zinc-900 dark:bg-white text-white dark:text-black border-zinc-900 dark:border-white"
                : "border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400"}`}>
              {f.label}
            </button>
          ))}
        </div>
        {feed.length === 0 ? (
          <p className="text-sm text-zinc-500 py-6 text-center">Nothing here yet.</p>
        ) : (
          <ul className="divide-y divide-zinc-200 dark:divide-zinc-800 max-h-[32rem] overflow-y-auto">
            {feed.slice(0, 200).map((e, i) => (
              <li key={`${e.at}-${i}`} className="flex items-start gap-3 py-2.5">
                <span className="text-[10px] text-zinc-400 w-24 shrink-0 pt-0.5">{when(e.at)}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-zinc-900 dark:text-white leading-snug">{e.text}</p>
                  <p className="text-[11px] text-zinc-500 mt-0.5 truncate">{e.who}</p>
                </div>
                {e.amount && <span className="text-sm font-black text-zinc-900 dark:text-white shrink-0">{e.amount}</span>}
                {e.href && (
                  <Link href={e.href} target="_blank" className="shrink-0 text-zinc-400 hover:text-zinc-900 dark:hover:text-white pt-0.5" aria-label="Open">
                    <ArrowUpRight className="w-4 h-4" />
                  </Link>
                )}
              </li>
            ))}
          </ul>
        )}
        <p className="text-[10px] text-zinc-400 mt-3">Updated {when(data.generatedAt)}. Orders and amounts come from the escrow contract; everything is testnet.</p>
      </div>
    </div>
  );
}
