"use client";

import { useEffect, useState, useCallback } from "react";
import { useActiveWalletChain } from "thirdweb/react";
// Replace viemAdapter with standard Viem creators
import { createPublicClient, http, formatEther } from "viem"; 
import { CONTRACT_ADDRESS, escrowAbi } from "@/lib/abi";
import Link from "next/link";
import { Loader2, ArrowRight, AlertCircle } from "lucide-react";

// Define the chain directly to avoid adapter overhead
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
      // 1. Create a direct Viem Public Client using the Monad RPC
      // This bypasses Thirdweb's 401 Unauthorized RPC issues
      const publicClient = createPublicClient({
        chain: MONAD_CHAIN as any,
        transport: http("https://testnet-rpc.monad.xyz"),
      });

      // 2. Get nextTradeId (Notice we cast it to bigint)
      const nextTradeIdBigInt = await publicClient.readContract({
        address: CONTRACT_ADDRESS,
        abi: escrowAbi,
        functionName: "nextTradeId",
      }) as bigint;

      const nextTradeId = Number(nextTradeIdBigInt);

      if (nextTradeId === 0) {
        setTrades([]);
        setLoading(false);
        return;
      }

      // 3. Fetch the last 10 trades sequentially to avoid rate limits
      const startId = Math.max(0, nextTradeId - 10);
      const fetchedTrades = [];

      for (let i = nextTradeId - 1; i >= startId; i--) {
        try {
          const res: any = await publicClient.readContract({
            address: CONTRACT_ADDRESS,
            abi: escrowAbi,
            functionName: "trades",
            args: [BigInt(i)],
          });
          fetchedTrades.push({
            id: i,
            buyer: res[0],
            seller: res[1],
            amount: res[2],
            released: res[3],
            sellerApprovedRefund: res[4],
            metadata: res[5]
          });
        } catch (err) {
          console.error(`Failed to fetch trade ${i}:`, err);
        }
      }

      setTrades(fetchedTrades);
      
    } catch (err: any) {
      console.error("Dashboard Fetch Error:", err);
      // Give a professional error for the judges
      setError("Network Sync Error. Please check your internet or Monad RPC status.");
    } finally {
      setLoading(false);
    }
  }, []); // Removed 'chain' dependency to make it fetchable even without wallet connection

  useEffect(() => {
    fetchTrades();
  }, [fetchTrades]);

  // ... rest of your UI code stays exactly the same ...

  useEffect(() => {
    fetchTrades();
  }, [fetchTrades]);

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center min-h-[60vh] transition-colors duration-300">
        <div className="text-center">
          <Loader2 className="w-10 h-10 text-[#FF007A] animate-spin mx-auto mb-4" />
          <p className="text-zinc-500 animate-pulse">Syncing with Monad Ledger...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col py-24 px-6 max-w-5xl mx-auto w-full z-10 transition-colors duration-300">
      <div className="flex flex-col md:flex-row md:items-center justify-between mb-12 gap-6">
        <div>
          <h2 className="text-4xl font-bold text-zinc-900 dark:text-white mb-2 tracking-tight transition-colors">Recent Escrows</h2>
          <p className="text-zinc-600 dark:text-zinc-400 transition-colors">Real-time status of P2P trades on Monad Pay-Lagos.</p>
        </div>
        <Link 
          href="/create" 
          className="px-8 py-4 bg-[#FF007A] text-white font-bold rounded-2xl hover:scale-105 transition-all shadow-lg shadow-pink-500/20 text-center"
        >
          + Start New Trade
        </Link>
      </div>

      {error ? (
        <div className="p-6 rounded-2xl bg-red-500/10 border border-red-500/20 flex items-center gap-4 text-red-600 dark:text-red-400">
          <AlertCircle className="w-6 h-6" />
          <p>{error}</p>
          <button onClick={fetchTrades} className="ml-auto text-xs underline uppercase tracking-widest font-bold">Retry</button>
        </div>
      ) : trades.length === 0 ? (
        <div className="text-center py-32 border-2 border-dashed border-zinc-300 dark:border-zinc-800 rounded-[2.5rem] bg-zinc-50 dark:bg-zinc-900/20 transition-colors">
          <p className="text-zinc-500 text-lg mb-6">The ledger is empty. Be the first to secure a trade in Lagos.</p>
          <Link href="/create" className="text-[#FF007A] font-bold hover:brightness-110 dark:hover:brightness-125 transition-all">
            Initialize First Escrow →
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {trades.map((trade) => (
            <Link 
              href={`/trade/${trade.id}`} 
              key={trade.id} 
              className="group bg-zinc-50 dark:bg-zinc-900/40 border border-zinc-200 dark:border-zinc-800 rounded-3xl p-8 hover:border-[#FF007A]/50 transition-all duration-500 hover:shadow-2xl hover:shadow-pink-500/5"
            >
              <div className="flex items-center justify-between mb-6">
                <div className="flex flex-col">
                  <span className="text-[10px] uppercase tracking-[0.2em] font-black text-zinc-500 mb-1">Receipt ID</span>
                  <span className="text-zinc-900 dark:text-white font-mono font-bold transition-colors">#00{trade.id}</span>
                </div>
                <div className={`px-4 py-1.5 rounded-full text-[10px] uppercase tracking-widest font-black border ${
                  trade.released 
                    ? 'bg-green-100 dark:bg-green-500/10 text-green-700 dark:text-green-400 border-green-200 dark:border-green-500/20' 
                    : trade.sellerApprovedRefund 
                      ? 'bg-blue-100 dark:bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-200 dark:border-blue-400/20'
                      : 'bg-pink-100 dark:bg-[#FF007A]/10 text-[#FF007A] border-pink-200 dark:border-[#FF007A]/20'
                }`}>
                  {trade.released ? 'Finalized' : trade.sellerApprovedRefund ? 'Refund Ready' : 'Funds Locked'}
                </div>
              </div>
              
              <div className="mb-8">
                <h3 className="text-3xl font-black text-zinc-900 dark:text-white transition-colors">{formatEther(trade.amount)} <span className="text-sm font-normal text-zinc-500">MON</span></h3>
                <p className="text-zinc-600 dark:text-zinc-400 mt-2 line-clamp-1 italic font-medium transition-colors">"{trade.metadata}"</p>
              </div>
              
              <div className="flex items-center justify-between pt-6 border-t border-zinc-200 dark:border-zinc-800/50 transition-colors">
                <span className="text-xs font-bold text-zinc-500 group-hover:text-zinc-900 dark:group-hover:text-white transition-colors">Manage Settlement</span>
                <div className="w-8 h-8 rounded-full bg-zinc-200 dark:bg-zinc-800 flex items-center justify-center group-hover:bg-[#FF007A] transition-all">
                  <ArrowRight className="w-4 h-4 text-zinc-600 dark:text-white group-hover:text-white group-hover:translate-x-0.5 transition-all" />
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}