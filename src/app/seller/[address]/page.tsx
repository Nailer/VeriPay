"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Loader2 } from "lucide-react";
import SellerReputationCard from "@/components/SellerReputationCard";
import type { TradeSummary } from "@/lib/reputation";

const STATUS_LABEL: Record<TradeSummary["status"], string> = {
  open: "In escrow",
  released: "Paid out",
  refunded: "Refunded",
  disputed: "Disputed",
  split: "Split by arbitrator",
};

const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

export default function SellerRecord() {
  const { address } = useParams<{ address: string }>();
  const [trades, setTrades] = useState<TradeSummary[] | null>(null);
  const valid = /^0x[a-fA-F0-9]{40}$/.test(address ?? "");

  useEffect(() => {
    if (!valid) return;
    fetch(`/api/reputation/${address}?trades=1`)
      .then((r) => r.json())
      .then((d) => setTrades(d.trades ?? []))
      .catch(() => setTrades([]));
  }, [address, valid]);

  if (!valid) {
    return <div className="flex-1 flex items-center justify-center p-8 text-sm text-zinc-500">That doesn&apos;t look like a wallet address.</div>;
  }

  return (
    <div className="flex-1 flex flex-col py-8 sm:py-14 px-4 sm:px-6 w-full max-w-2xl mx-auto">
      <Link href="/seller" className="flex items-center gap-2 text-sm text-zinc-500 hover:text-zinc-900 dark:hover:text-white mb-6">
        <ArrowLeft className="w-4 h-4" /> Check another seller
      </Link>

      <h1 className="text-2xl sm:text-3xl font-black text-zinc-900 dark:text-white tracking-tight mb-1">Trade record</h1>
      <p className="font-mono text-xs text-zinc-500 break-all mb-6">{address}</p>

      <SellerReputationCard address={address} showLink={false} />

      <h2 className="text-[10px] font-black uppercase tracking-widest text-zinc-500 mt-8 mb-3">Every trade, newest first</h2>

      {trades === null ? (
        <div className="flex items-center gap-2 text-sm text-zinc-500"><Loader2 className="w-4 h-4 animate-spin" /> Reading from Monad…</div>
      ) : trades.length === 0 ? (
        <p className="text-sm text-zinc-500">No trades yet.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {trades.map((t) => (
            <li key={t.id}>
              <Link
                href={`/trade/${t.id}`}
                className="flex items-center justify-between gap-3 p-4 rounded-2xl bg-zinc-50 dark:bg-zinc-900/40 border border-zinc-200 dark:border-zinc-800 hover:border-zinc-400 dark:hover:border-zinc-600 transition-colors"
              >
                <div className="min-w-0">
                  <div className="text-sm font-bold text-zinc-900 dark:text-white truncate">{t.metadata || `Trade #${t.id}`}</div>
                  <div className="text-[11px] text-zinc-500 mt-0.5">
                    #{t.id} · as {t.role} · with <span className="font-mono">{short(t.counterparty)}</span>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-sm font-black text-zinc-900 dark:text-white">{t.amount} {t.symbol}</div>
                  <div className="text-[10px] font-black uppercase tracking-widest text-zinc-500">{STATUS_LABEL[t.status]}</div>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
