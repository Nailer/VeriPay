"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import { useActiveAccount } from "thirdweb/react";
import { createPublicClient, createWalletClient, http, custom, formatEther } from "viem";
import { CONTRACT_ADDRESS, escrowAbi } from "@/lib/abi";
import { Loader2, ShieldAlert, CheckCircle2, ArrowLeft, Info, HelpCircle } from "lucide-react";
import Link from "next/link";

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
  buyer: string;
  seller: string;
  amount: bigint;
  released: boolean;
  sellerApprovedRefund: boolean;
  metadata: string;
};

export default function TradeDetail() {
  const params = useParams();
  const idStr = params?.id as string;
  const tradeId = idStr ? BigInt(idStr) : BigInt(0);

  const account = useActiveAccount();
  const [trade, setTrade] = useState<TradeData | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState("");

  const fetchTrade = useCallback(async () => {
    if (!idStr) return;
    try {
      const publicClient = createPublicClient({
        chain: MONAD_CHAIN as any,
        transport: http("https://testnet-rpc.monad.xyz"),
      });

      const res = await publicClient.readContract({
        address: CONTRACT_ADDRESS,
        abi: escrowAbi,
        functionName: "trades",
        args: [tradeId],
      }) as any;

      setTrade({
        buyer: res[0],
        seller: res[1],
        amount: res[2],
        released: res[3],
        sellerApprovedRefund: res[4],
        metadata: res[5],
      });
    } catch (err) {
      console.error(err);
      setError("Failed to fetch trade details from Monad.");
    } finally {
      setLoading(false);
    }
  }, [idStr, tradeId]);

  useEffect(() => {
    fetchTrade();
  }, [fetchTrade]);

  const executeAction = async (functionName: "releaseToSeller" | "sellerApproveRefund" | "buyerClaimRefund") => {
    if (!account || !window.ethereum) {
      setError("Please connect MetaMask first.");
      return;
    }

    setActionLoading(true);
    setError("");

    try {
      const MONAD_CHAIN = {
        id: 10143,
        name: "Monad Testnet",
        nativeCurrency: { name: "MON", symbol: "MON", decimals: 18 },
        rpcUrls: {
          default: { http: ["https://testnet-rpc.monad.xyz"] },
          public: { http: ["https://testnet-rpc.monad.xyz"] },
        },
      };
      // Switch network to Monad Testnet before transaction
      try {
        await window.ethereum.request({
          method: "wallet_switchEthereumChain",
          params: [{ chainId: "0x279f" }], // 10143 in hex
        });
      } catch (switchError: any) {
        if (switchError.code === 4902) {
          try {
            await window.ethereum.request({
              method: "wallet_addEthereumChain",
              params: [
                {
                  chainId: "0x279f",
                  chainName: "Monad Testnet",
                  nativeCurrency: { name: "MON", symbol: "MON", decimals: 18 },
                  rpcUrls: ["https://testnet-rpc.monad.xyz"],
                },
              ],
            });
          } catch (addError) {
            setError("Failed to add Monad Testnet to wallet.");
            setActionLoading(false);
            return;
          }
        } else {
          setError("Please switch to Monad Testnet in your wallet.");
          setActionLoading(false);
          return;
        }
      }

      const walletClient = createWalletClient({
        chain: MONAD_CHAIN as any,
        transport: custom(window.ethereum),
      });

      const publicClient = createPublicClient({
        chain: MONAD_CHAIN as any,
        transport: http("https://testnet-rpc.monad.xyz"),
      });


      const hash = await walletClient.writeContract({
        address: CONTRACT_ADDRESS,
        abi: escrowAbi,
        functionName,
        args: [tradeId],
        account: account.address as `0x${string}`,
        chain: MONAD_CHAIN as any, // <--- ADD THIS LINE TO FIX THE ERROR
      });

      await publicClient.waitForTransactionReceipt({ hash });
      await fetchTrade(); // Reload UI state
    } catch (err: any) {
      console.error(err);
      setError(err.shortMessage || "Transaction failed.");
    } finally {
      setActionLoading(false);
    }
  };

  if (loading) return (
    <div className="flex-1 flex flex-col items-center justify-center min-h-[60vh] transition-colors duration-300">
      <Loader2 className="w-10 h-10 text-[#FF007A] animate-spin mb-4" />
      <p className="text-zinc-600 dark:text-zinc-500 font-bold uppercase tracking-widest text-[10px] transition-colors">Loading Ledger State...</p>
    </div>
  );

  if (!trade) return (
    <div className="flex-1 flex flex-col items-center justify-center p-6 text-center transition-colors duration-300">
      <HelpCircle className="w-16 h-16 text-zinc-300 dark:text-zinc-800 mb-4 transition-colors" />
      <h2 className="text-2xl font-bold text-zinc-900 dark:text-white mb-2 transition-colors">Trade Record Not Found</h2>
      <Link href="/dashboard" className="text-[#FF007A] hover:underline">Return to Dashboard</Link>
    </div>
  );

  const isBuyer = account?.address.toLowerCase() === trade.buyer.toLowerCase();
  const isSeller = account?.address.toLowerCase() === trade.seller.toLowerCase();

  return (
    <div className="flex-1 flex flex-col items-center py-16 px-6 relative z-10 w-full max-w-3xl mx-auto transition-colors duration-300">
      <div className="w-full mb-8 flex items-center justify-between">
        <Link href="/dashboard" className="inline-flex items-center gap-2 text-zinc-600 dark:text-zinc-500 hover:text-zinc-900 dark:hover:text-white transition-colors font-bold uppercase tracking-widest text-[10px]">
          <ArrowLeft className="w-4 h-4" /> Back to Ledger
        </Link>
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full animate-pulse ${trade.released ? 'bg-zinc-400 dark:bg-zinc-500' : 'bg-green-500'}`} />
          <span className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">Monad Live Status</span>
        </div>
      </div>

      <div className="w-full bg-zinc-50 dark:bg-zinc-900/40 border border-zinc-200 dark:border-zinc-800 rounded-[2.5rem] p-10 backdrop-blur-xl shadow-2xl transition-colors duration-300">
        {/* Status Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between mb-10 gap-6">
          <div>
            <h2 className="text-4xl font-black text-zinc-900 dark:text-white mb-2 transition-colors">Trade #00{idStr}</h2>
            <div className="flex items-center gap-2 text-zinc-500 text-sm italic">
              <Info className="w-4 h-4" />
              <span>{trade.metadata}</span>
            </div>
          </div>
          <div className={`px-6 py-2 rounded-2xl font-black text-[10px] uppercase tracking-widest border ${trade.released
              ? 'bg-green-100 dark:bg-green-500/10 text-green-700 dark:text-green-400 border-green-200 dark:border-green-500/20'
              : trade.sellerApprovedRefund
                ? 'bg-blue-100 dark:bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-200 dark:border-blue-400/20'
                : 'bg-pink-100 dark:bg-[#FF007A]/10 text-[#FF007A] border-pink-200 dark:border-[#FF007A]/20'
            }`}>
            {trade.released ? "Settled" : trade.sellerApprovedRefund ? "Refund Ready" : "Funds Escrowed"}
          </div>
        </div>

        {error && (
          <div className="p-4 mb-8 rounded-2xl bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 text-red-600 dark:text-red-400 text-sm font-medium transition-colors">
            ⚠️ {error}
          </div>
        )}

        <div className="space-y-8">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="p-8 rounded-[2rem] bg-white dark:bg-black/40 border border-zinc-200 dark:border-zinc-800 flex flex-col justify-center transition-colors">
              <span className="text-[10px] font-black text-zinc-500 dark:text-zinc-600 uppercase tracking-widest mb-2 transition-colors">Locked Value</span>
              <span className="text-4xl font-black text-zinc-900 dark:text-white transition-colors">{formatEther(trade.amount)} <span className="text-sm font-normal text-zinc-500">MON</span></span>
            </div>

            <div className="p-8 rounded-[2rem] bg-white dark:bg-black/40 border border-zinc-200 dark:border-zinc-800 flex flex-col justify-center transition-colors">
              <span className="text-[10px] font-black text-zinc-500 dark:text-zinc-600 uppercase tracking-widest mb-2 transition-colors">Agreement Status</span>
              {trade.released ? (
                <div className="flex items-center gap-3 text-green-600 dark:text-green-400 font-black uppercase tracking-widest text-xs transition-colors">
                  <CheckCircle2 className="w-6 h-6" /> Concluded
                </div>
              ) : (
                <div className="flex items-center gap-3 text-yellow-600 dark:text-yellow-500 font-black uppercase tracking-widest text-xs transition-colors">
                  <ShieldAlert className="w-6 h-6 animate-pulse" /> Protected
                </div>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4">
            <div className="p-6 rounded-2xl bg-white dark:bg-zinc-900/40 border border-zinc-200 dark:border-zinc-800 flex items-center justify-between transition-colors">
              <div className="flex flex-col">
                <span className="text-[10px] font-black text-zinc-500 dark:text-zinc-600 uppercase tracking-widest mb-1 transition-colors">Buyer (Payer)</span>
                <span className="text-zinc-900 dark:text-white font-mono text-xs transition-colors">{trade.buyer.slice(0, 10)}...{trade.buyer.slice(-8)}</span>
              </div>
              {isBuyer && <span className="text-[10px] font-black bg-[#FF007A] text-white px-3 py-1 rounded-full">YOU</span>}
            </div>
            <div className="p-6 rounded-2xl bg-white dark:bg-zinc-900/40 border border-zinc-200 dark:border-zinc-800 flex items-center justify-between transition-colors">
              <div className="flex flex-col">
                <span className="text-[10px] font-black text-zinc-500 dark:text-zinc-600 uppercase tracking-widest mb-1 transition-colors">Seller (Vendor)</span>
                <span className="text-zinc-900 dark:text-white font-mono text-xs transition-colors">{trade.seller.slice(0, 10)}...{trade.seller.slice(-8)}</span>
              </div>
              {isSeller && <span className="text-[10px] font-black bg-[#FF007A] text-white px-3 py-1 rounded-full">YOU</span>}
            </div>
          </div>
        </div>

        {/* Action Panel: Only visible if active */}
        {!trade.released && (isBuyer || isSeller) && (
          <div className="mt-12 p-8 rounded-[2.5rem] bg-gradient-to-b from-zinc-100/50 dark:from-zinc-800/20 to-transparent border border-zinc-200 dark:border-zinc-800 transition-colors">
            <h3 className="text-sm font-black text-zinc-900 dark:text-white uppercase tracking-[0.3em] mb-6 text-center transition-colors">Settlement Actions</h3>
            <div className="flex flex-col gap-4">

              {isBuyer && !trade.sellerApprovedRefund && (
                <button
                  onClick={() => executeAction("releaseToSeller")}
                  disabled={actionLoading}
                  className="w-full flex items-center justify-center px-8 py-5 bg-zinc-900 dark:bg-white text-white dark:text-black font-black uppercase tracking-widest rounded-2xl hover:bg-zinc-800 dark:hover:bg-zinc-200 transition-all disabled:opacity-50"
                >
                  {actionLoading ? <Loader2 className="w-5 h-5 animate-spin mr-3" /> : null}
                  Confirm Delivery & Release MON
                </button>
              )}

              {isSeller && !trade.sellerApprovedRefund && (
                <button
                  onClick={() => executeAction("sellerApproveRefund")}
                  disabled={actionLoading}
                  className="w-full flex items-center justify-center px-8 py-5 bg-zinc-200 dark:bg-zinc-800 text-zinc-900 dark:text-white font-black uppercase tracking-widest rounded-2xl hover:bg-zinc-300 dark:hover:bg-zinc-700 transition-all disabled:opacity-50"
                >
                  {actionLoading ? <Loader2 className="w-5 h-5 animate-spin mr-3" /> : null}
                  Authorize Return of Funds
                </button>
              )}

              {isBuyer && trade.sellerApprovedRefund && (
                <button
                  onClick={() => executeAction("buyerClaimRefund")}
                  disabled={actionLoading}
                  className="w-full flex items-center justify-center px-8 py-5 bg-[#FF007A] text-white font-black uppercase tracking-widest rounded-2xl hover:scale-[1.02] transition-all disabled:opacity-50 shadow-xl shadow-pink-500/20"
                >
                  {actionLoading ? <Loader2 className="w-5 h-5 animate-spin mr-3" /> : null}
                  Withdraw Refund
                </button>
              )}

              {!isBuyer && !isSeller && (
                <p className="text-center text-zinc-500 dark:text-zinc-600 text-xs italic transition-colors">You are viewing this trade as an observer.</p>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}