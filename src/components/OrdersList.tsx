"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import { ArrowRight, Loader2 } from "lucide-react";
import { usePolling } from "@/lib/usePolling";
import type { TradeSummary } from "@/lib/reputation";

const naira = (t: TradeSummary) => (t.symbol === "NGN" ? `₦${t.amount}` : `${t.amount} ${t.symbol}`);

// What each status means to the person looking at it, and whether it needs them.
function describe(t: TradeSummary): { label: string; todo: boolean } {
  if (t.status === "open") {
    return t.role === "seller"
      ? { label: "Paid — deliver this order", todo: true }
      : { label: "Held safely — confirm when it arrives", todo: true };
  }
  if (t.status === "disputed") return { label: "Under review", todo: false };
  if (t.status === "refunded") return { label: t.role === "buyer" ? "Refunded to you" : "Refunded to buyer", todo: false };
  if (t.status === "split") return { label: "Settled by review", todo: false };
  return { label: t.role === "seller" ? "Paid out to you" : "Completed", todo: false };
}

/**
 * A person's orders, read from the escrow contract. `role` narrows it to what
 * they sold or what they bought; omit it for both.
 */
export default function OrdersList({ address, role, empty }: { address: string; role?: "buyer" | "seller"; empty: string }) {
  const [orders, setOrders] = useState<TradeSummary[] | null>(null);

  const load = useCallback(async () => {
    try {
      const d = await fetch(`/api/reputation/${address}?trades=1`).then((r) => r.json());
      setOrders(((d.trades as TradeSummary[]) ?? []).filter((t) => !role || t.role === role));
    } catch {
      setOrders((prev) => prev ?? []);
    }
  }, [address, role]);

  // Keep watching while something is still waiting on someone.
  usePolling(load, 20_000, orders === null || orders.some((o) => o.status === "open" || o.status === "disputed"));

  if (orders === null) return <Loader2 className="w-5 h-5 animate-spin text-zinc-500" />;
  if (orders.length === 0) return <p className="text-sm text-zinc-500 leading-relaxed">{empty}</p>;

  return (
    <div className="flex flex-col divide-y divide-zinc-200 dark:divide-zinc-800">
      {orders.map((t) => {
        const { label, todo } = describe(t);
        return (
          <Link key={t.id} href={`/trade/${t.id}`} className="flex items-center gap-3 py-3.5 group">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold text-zinc-900 dark:text-white truncate">{t.metadata || `Order #${t.id}`}</p>
              <p className={`text-xs mt-0.5 ${todo ? "font-bold text-zinc-900 dark:text-white" : "text-zinc-500"}`}>
                {todo && <span className="inline-block w-1.5 h-1.5 rounded-full bg-zinc-900 dark:bg-white mr-1.5 align-middle" />}
                {label}
              </p>
            </div>
            <span className="text-sm font-black text-zinc-900 dark:text-white shrink-0">{naira(t)}</span>
            <ArrowRight className="w-4 h-4 text-zinc-400 group-hover:translate-x-0.5 transition-transform shrink-0" />
          </Link>
        );
      })}
    </div>
  );
}
