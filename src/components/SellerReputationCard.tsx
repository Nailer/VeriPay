"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ShieldCheck, ShieldQuestion, Loader2, ArrowRight } from "lucide-react";
import type { Reputation } from "@/lib/reputation";

type State =
  | { kind: "loading" }
  | { kind: "error" }
  | { kind: "ready"; reputation: Reputation; source: "envio" | "chain" };

// The "check before you pay" card: a seller's record, read from the escrow
// contract's own history — not a rating VeriPay assigns or could edit.
export default function SellerReputationCard({ address, showLink = true }: { address: string; showLink?: boolean }) {
  const [state, setState] = useState<State>({ kind: "loading" });

  useEffect(() => {
    let cancelled = false;
    setState({ kind: "loading" });
    fetch(`/api/reputation/${address}`)
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return;
        if (d.reputation) setState({ kind: "ready", reputation: d.reputation, source: d.source });
        else setState({ kind: "error" });
      })
      .catch(() => !cancelled && setState({ kind: "error" }));
    return () => { cancelled = true; };
  }, [address]);

  if (state.kind === "loading") {
    return (
      <div className="flex items-center gap-3 p-4 rounded-2xl bg-white dark:bg-black/40 border border-zinc-200 dark:border-zinc-800 text-xs text-zinc-500">
        <Loader2 className="w-4 h-4 animate-spin" /> Checking this seller&apos;s on-chain record…
      </div>
    );
  }

  if (state.kind === "error") {
    return (
      <div className="p-4 rounded-2xl bg-white dark:bg-black/40 border border-zinc-200 dark:border-zinc-800 text-xs text-zinc-500">
        Couldn&apos;t load this seller&apos;s record right now. Escrow still protects you either way.
      </div>
    );
  }

  const r = state.reputation;
  const asSellerSettled = r.completedTrades;
  const isNew = r.totalTrades === 0;

  return (
    <div className="p-4 sm:p-5 rounded-2xl bg-white dark:bg-black/40 border border-zinc-200 dark:border-zinc-800">
      <div className="flex items-center gap-2 mb-3">
        {isNew
          ? <ShieldQuestion className="w-4 h-4 text-zinc-500" />
          : <ShieldCheck className="w-4 h-4 text-zinc-900 dark:text-white" />}
        <span className="text-[10px] font-black uppercase tracking-widest text-zinc-500">
          Seller record · verified on Monad
        </span>
      </div>

      {isNew ? (
        <p className="text-sm text-zinc-600 dark:text-zinc-400 leading-relaxed">
          No VeriPay trades yet. That&apos;s not a red flag on its own — every seller starts somewhere —
          and your money stays locked until you confirm delivery either way.
        </p>
      ) : (
        <div className="grid grid-cols-3 gap-2 text-center">
          <Stat value={asSellerSettled} label="Paid out" />
          <Stat value={r.disputedTrades} label="Disputes" />
          <Stat value={r.totalTrades} label="Total trades" />
        </div>
      )}

      {showLink && !isNew && (
        <Link href={`/seller/${address}`} className="mt-3 inline-flex items-center gap-1 text-[11px] font-bold text-zinc-500 hover:text-zinc-900 dark:hover:text-white transition-colors">
          See every trade <ArrowRight className="w-3 h-3" />
        </Link>
      )}
    </div>
  );
}

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <div className="py-2 rounded-xl bg-zinc-50 dark:bg-zinc-900/60">
      <div className="text-xl font-black text-zinc-900 dark:text-white">{value}</div>
      <div className="text-[9px] font-black uppercase tracking-widest text-zinc-500 mt-0.5">{label}</div>
    </div>
  );
}
