"use client";

import { useEffect, useState, useCallback } from "react";
import { useActiveWalletChain } from "thirdweb/react";
import { createPublicClient, http, formatEther } from "viem";
import { readNextTradeId, readTrade } from "@/lib/escrow";
import Link from "next/link";
import { Loader2, ArrowRight, AlertCircle } from "lucide-react";

const MONAD_CHAIN = {
  id: 10143,
  name: "Monad Testnet",
  nativeCurrency: { name: "MON", symbol: "MON", decimals: 18 },
  rpcUrls: {
    default: { http: ["https://testnet-rpc.monad.xyz"] },
    public: { http: ["https://testnet-rpc.monad.xyz"] },
  },
};

type TradeData = {
  id: number;
  buyer: string;
  seller: string;
  amount: bigint;
  released: boolean;
  sellerApprovedRefund: boolean;
  disputed: boolean;
  refunded: boolean;
  metadata: string;
};

export default function Dashboard() {
  const chain = useActiveWalletChain();
  const [trades, setTrades] = useState<TradeData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const fetchTrades = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const publicClient = createPublicClient({
        chain: MONAD_CHAIN as any,
        transport: http("https://testnet-rpc.monad.xyz"),
      });

      // readTrade handles both the old and new contract shapes.
      const nextTradeId = await readNextTradeId(publicClient as any);

      if (nextTradeId === 0) {
        setTrades([]);
        setLoading(false);
        return;
      }

      const startId = Math.max(0, nextTradeId - 10);
      const fetchedTrades: TradeData[] = [];

      for (let i = nextTradeId - 1; i >= startId; i--) {
        try {
          const t = await readTrade(publicClient as any, i);
          fetchedTrades.push({ id: i, ...t });
        } catch (err) {
          console.error(`Failed to fetch trade ${i}:`, err);
        }
      }

      setTrades(fetchedTrades);
    } catch (err: any) {
      console.error("Dashboard Fetch Error:", err);
      setError("Network Sync Error. Please check your internet or Monad RPC status.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTrades();
  }, [fetchTrades]);

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center min-h-[60vh] transition-colors duration-300">
        <div className="text-center">
          <Loader2 className="w-10 h-10 text-zinc-900 dark:text-white animate-spin mx-auto mb-4" />
          <p className="text-zinc-500 animate-pulse text-sm">Syncing with Monad Ledger...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col py-8 sm:py-12 md:py-24 px-4 sm:px-6 max-w-5xl mx-auto w-full z-10 transition-colors duration-300">

      {/* Header row */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-8 sm:mb-12 gap-4">
        <div>
          <h2 className="text-3xl sm:text-4xl font-bold text-zinc-900 dark:text-white mb-1 sm:mb-2 tracking-tight transition-colors">
            Recent Escrows
          </h2>
          <p className="text-sm sm:text-base text-zinc-600 dark:text-zinc-400 transition-colors">
            Real-time status of P2P trades on VeriPay.
          </p>
        </div>
        <Link
          href="/create"
          className="w-full sm:w-auto text-center px-6 py-3.5 sm:px-8 sm:py-4 bg-zinc-900 dark:bg-white text-white dark:text-black font-bold rounded-2xl hover:scale-105 transition-all shadow-lg text-sm sm:text-base"
        >
          + Start New Trade
        </Link>
      </div>

      {error ? (
        <div className="p-5 rounded-2xl bg-zinc-100 dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 flex flex-col sm:flex-row items-start sm:items-center gap-3 text-zinc-900 dark:text-white">
          <AlertCircle className="w-5 h-5 shrink-0" />
          <p className="text-sm flex-1">{error}</p>
          <button onClick={fetchTrades} className="text-xs underline uppercase tracking-widest font-bold shrink-0">Retry</button>
        </div>
      ) : trades.length === 0 ? (
        <div className="text-center py-20 sm:py-32 border-2 border-dashed border-zinc-300 dark:border-zinc-800 rounded-[2.5rem] bg-zinc-50 dark:bg-zinc-900/20 transition-colors px-6">
          <p className="text-zinc-500 text-base sm:text-lg mb-6">The ledger is empty. Be the first to secure a trade in Lagos.</p>
          <Link href="/create" className="text-zinc-900 dark:text-white font-bold underline underline-offset-4 transition-all">
            Initialize First Escrow →
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
          {trades.map((trade) => (
            <Link
              href={`/trade/${trade.id}`}
              key={trade.id}
              className="group bg-zinc-50 dark:bg-zinc-900/40 border border-zinc-200 dark:border-zinc-800 rounded-2xl sm:rounded-3xl p-5 sm:p-6 md:p-8 hover:border-zinc-400 dark:hover:border-zinc-500 transition-all duration-500 hover:shadow-2xl active:scale-[0.98]"
            >
              <div className="flex items-center justify-between mb-4 sm:mb-6">
                <div className="flex flex-col">
                  <span className="text-[10px] uppercase tracking-[0.2em] font-black text-zinc-500 mb-0.5">Receipt ID</span>
                  <span className="text-zinc-900 dark:text-white font-mono font-bold transition-colors text-sm">#00{trade.id}</span>
                </div>
                <div className={`px-3 py-1 rounded-full text-[10px] uppercase tracking-widest font-black border ${
                  trade.released || trade.refunded || (trade.disputed && !trade.released)
                    ? "bg-zinc-900 dark:bg-white text-white dark:text-black border-zinc-900 dark:border-white"
                    : trade.sellerApprovedRefund
                      ? "bg-white dark:bg-black text-zinc-900 dark:text-white border-zinc-400 dark:border-zinc-500"
                      : "bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-white border-zinc-300 dark:border-zinc-600"
                }`}>
                  {trade.refunded
                    ? "Refunded"
                    : trade.released
                      ? "Finalized"
                      : trade.disputed
                        ? "In Dispute"
                        : trade.sellerApprovedRefund
                          ? "Refund Ready"
                          : "Funds Locked"}
                </div>
              </div>

              <div className="mb-5 sm:mb-8">
                <h3 className="text-2xl sm:text-3xl font-black text-zinc-900 dark:text-white transition-colors">
                  {formatEther(trade.amount)} <span className="text-sm font-normal text-zinc-500">MON</span>
                </h3>
                <p className="text-zinc-600 dark:text-zinc-400 mt-1.5 line-clamp-1 italic font-medium transition-colors text-sm">&quot;{trade.metadata}&quot;</p>
              </div>

              <div className="flex items-center justify-between pt-4 sm:pt-6 border-t border-zinc-200 dark:border-zinc-800/50 transition-colors">
                <span className="text-xs font-bold text-zinc-500 group-hover:text-zinc-900 dark:group-hover:text-white transition-colors">Manage Settlement</span>
                <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-zinc-200 dark:bg-zinc-800 flex items-center justify-center group-hover:bg-zinc-900 dark:group-hover:bg-white transition-all">
                  <ArrowRight className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-zinc-600 dark:text-white group-hover:text-white dark:group-hover:text-black group-hover:translate-x-0.5 transition-all" />
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}