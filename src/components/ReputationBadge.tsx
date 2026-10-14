"use client";

import { useEffect, useState } from "react";
import { ShieldCheck } from "lucide-react";
import type { Reputation } from "@/app/api/reputation/[address]/route";

// Shows an address's on-chain trade history — derived from the escrow
// contract's own events via the Envio indexer (see indexer/), not from
// anything VeriPay itself could quietly edit. Renders nothing when the
// indexer isn't configured yet, or the address has no history — a "0
// trades" badge on every fresh address would just be noise.
export default function ReputationBadge({ address }: { address: string }) {
  const [reputation, setReputation] = useState<Reputation | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/reputation/${address}`)
      .then((res) => res.json())
      .then((data) => {
        if (!cancelled && data.configured && data.reputation && data.reputation.totalTrades > 0) {
          setReputation(data.reputation);
        }
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [address]);

  if (!reputation) return null;

  const disputeFree = reputation.disputedTrades === 0;

  return (
    <div
      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-zinc-100 dark:bg-zinc-800 text-[10px] font-bold text-zinc-600 dark:text-zinc-300 shrink-0"
      title="On-chain trade history, verified independently of VeriPay"
    >
      <ShieldCheck className="w-3 h-3" />
      {reputation.completedTrades} completed
      {disputeFree ? " · 0 disputes" : ` · ${reputation.disputedTrades} disputed`}
    </div>
  );
}
