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

      try {
        await window.ethereum.request({
          method: "wallet_switchEthereumChain",
          params: [{ chainId: "0x279f" }],
        });
      } catch (switchError: any) {
        if (switchError.code === 4902) {
          try {
            await window.ethereum.request({
              method: "wallet_addEthereumChain",
              params: [{
                chainId: "0x279f",
                chainName: "Monad Testnet",
                nativeCurrency: { name: "MON", symbol: "MON", decimals: 18 },
                rpcUrls: ["https://testnet-rpc.monad.xyz"],
              }],
            });
          } catch {
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

      const walletClient = createWalletClient({ chain: MONAD_CHAIN as any, transport: custom(window.ethereum) });
      const publicClient = createPublicClient({ chain: MONAD_CHAIN as any, transport: http("https://testnet-rpc.monad.xyz") });

      const hash = await walletClient.writeContract({
        address: CONTRACT_ADDRESS,
        abi: escrowAbi,
        functionName,
        args: [tradeId],
        account: account.address as `0x${string}`,
        chain: MONAD_CHAIN as any,
      });

      await publicClient.waitForTransactionReceipt({ hash });

      const actionMap = {
        releaseToSeller: "released",
        sellerApproveRefund: "refund_approved",
        buyerClaimRefund: "refund_claimed",
      } as const;

      fetch("/api/trades/log", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tradeId: idStr,
          action: actionMap[functionName],
          actorAddress: account.address,
          txHash: hash,
        }),
      }).catch(() => {});

      await fetchTrade();
    } catch (err: any) {
      console.error(err);
      setError(err.shortMessage || "Transaction failed.");
    } finally {
      setActionLoading(false);
    }
  };

  if (loading) return (
    <div className="flex-1 flex flex-col items-center justify-center min-h-[60vh]">
      <Loader2 className="w-10 h-10 text-zinc-900 dark:text-white animate-spin mb-4" />
      <p className="text-zinc-600 dark:text-zinc-500 font-bold uppercase tracking-widest text-[10px]">Loading Ledger State...</p>
    </div>
  );

  if (!trade) return (
    <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
      <HelpCircle className="w-16 h-16 text-zinc-300 dark:text-zinc-800 mb-4" />
      <h2 className="text-2xl font-bold text-zinc-900 dark:text-white mb-2">Trade Record Not Found</h2>
      <Link href="/dashboard" className="text-zinc-900 dark:text-white font-bold underline underline-offset-4">Return to Dashboard</Link>
    </div>
  );

  const isBuyer = account?.address.toLowerCase() === trade.buyer.toLowerCase();
  const isSeller = account?.address.toLowerCase() === trade.seller.toLowerCase();

  // Helper: truncate address responsively
  const truncAddr = (addr: string) => `${addr.slice(0, 8)}...${addr.slice(-6)}`;

  return (
    <div className="flex-1 flex flex-col items-center py-6 sm:py-8 md:py-16 px-4 sm:px-6 relative z-10 w-full max-w-3xl mx-auto transition-colors duration-300">

      {/* Top bar */}
      <div className="w-full mb-6 sm:mb-8 flex items-center justify-between">
        <Link href="/dashboard" className="inline-flex items-center gap-2 text-zinc-600 dark:text-zinc-500 hover:text-zinc-900 dark:hover:text-white transition-colors font-bold uppercase tracking-widest text-[10px]">
          <ArrowLeft className="w-4 h-4" /> Back to Ledger
        </Link>
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full animate-pulse ${trade.released ? "bg-zinc-400 dark:bg-zinc-500" : "bg-zinc-900 dark:bg-white"}`} />
          <span className="text-[10px] font-black text-zinc-500 uppercase tracking-widest hidden xs:block">Monad Live Status</span>
        </div>
      </div>

      <div className="w-full bg-zinc-50 dark:bg-zinc-900/40 border border-zinc-200 dark:border-zinc-800 rounded-[2rem] sm:rounded-[2.5rem] p-5 sm:p-6 md:p-10 shadow-2xl transition-colors duration-300">

        {/* Status Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-7 sm:mb-10 gap-3 sm:gap-6">
          <div>
            <h2 className="text-2xl sm:text-3xl md:text-4xl font-black text-zinc-900 dark:text-white mb-1.5 transition-colors">Trade #00{idStr}</h2>
            <div className="flex items-start gap-2 text-zinc-500 text-xs sm:text-sm italic">
              <Info className="w-4 h-4 shrink-0 mt-0.5" />
              <span className="leading-relaxed">{trade.metadata}</span>
            </div>
          </div>
          <div className={`self-start sm:self-auto px-4 sm:px-6 py-1.5 sm:py-2 rounded-2xl font-black text-[10px] uppercase tracking-widest border whitespace-nowrap ${
            trade.released
              ? "bg-zinc-900 dark:bg-white text-white dark:text-black border-zinc-900 dark:border-white"
              : trade.sellerApprovedRefund
                ? "bg-white dark:bg-black text-zinc-900 dark:text-white border-zinc-400 dark:border-zinc-500"
                : "bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-white border-zinc-300 dark:border-zinc-600"
          }`}>
            {trade.released ? "Settled" : trade.sellerApprovedRefund ? "Refund Ready" : "Funds Escrowed"}
          </div>
        </div>

        {error && (
          <div className="p-4 mb-6 sm:mb-8 rounded-2xl bg-zinc-100 dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 text-zinc-900 dark:text-white text-sm font-medium">
            ⚠️ {error}
          </div>
        )}

        <div className="space-y-5 sm:space-y-8">
          {/* Amount + Status grid */}
          <div className="grid grid-cols-2 gap-4 sm:gap-8">
            <div className="p-4 sm:p-6 md:p-8 rounded-[1.5rem] sm:rounded-[2rem] bg-white dark:bg-black/40 border border-zinc-200 dark:border-zinc-800 flex flex-col justify-center transition-colors">
              <span className="text-[10px] font-black text-zinc-500 dark:text-zinc-600 uppercase tracking-widest mb-1.5 transition-colors">Locked Value</span>
              <span className="text-xl sm:text-3xl md:text-4xl font-black text-zinc-900 dark:text-white transition-colors leading-tight">
                {formatEther(trade.amount)}{" "}
                <span className="text-xs sm:text-sm font-normal text-zinc-500">MON</span>
              </span>
            </div>

            <div className="p-4 sm:p-6 md:p-8 rounded-[1.5rem] sm:rounded-[2rem] bg-white dark:bg-black/40 border border-zinc-200 dark:border-zinc-800 flex flex-col justify-center transition-colors">
              <span className="text-[10px] font-black text-zinc-500 dark:text-zinc-600 uppercase tracking-widest mb-1.5 transition-colors">Status</span>
              {trade.released ? (
                <div className="flex items-center gap-2 text-zinc-900 dark:text-white font-black uppercase tracking-widest text-[10px] sm:text-xs transition-colors">
                  <CheckCircle2 className="w-5 h-5 sm:w-6 sm:h-6 shrink-0" /> Concluded
                </div>
              ) : (
                <div className="flex items-center gap-2 text-zinc-700 dark:text-zinc-300 font-black uppercase tracking-widest text-[10px] sm:text-xs transition-colors">
                  <ShieldAlert className="w-5 h-5 sm:w-6 sm:h-6 animate-pulse shrink-0" /> Protected
                </div>
              )}
            </div>
          </div>

          {/* Parties */}
          <div className="grid grid-cols-1 gap-3 sm:gap-4">
            <div className="p-4 sm:p-5 md:p-6 rounded-xl sm:rounded-2xl bg-white dark:bg-zinc-900/40 border border-zinc-200 dark:border-zinc-800 flex items-center justify-between gap-3 transition-colors">
              <div className="flex flex-col min-w-0">
                <span className="text-[10px] font-black text-zinc-500 dark:text-zinc-600 uppercase tracking-widest mb-1 transition-colors">Buyer (Payer)</span>
                <span className="text-zinc-900 dark:text-white font-mono text-[11px] sm:text-xs transition-colors truncate">{truncAddr(trade.buyer)}</span>
              </div>
              {isBuyer && <span className="text-[10px] font-black bg-zinc-900 dark:bg-white text-white dark:text-black px-2.5 py-1 rounded-full shrink-0">YOU</span>}
            </div>
            <div className="p-4 sm:p-5 md:p-6 rounded-xl sm:rounded-2xl bg-white dark:bg-zinc-900/40 border border-zinc-200 dark:border-zinc-800 flex items-center justify-between gap-3 transition-colors">
              <div className="flex flex-col min-w-0">
                <span className="text-[10px] font-black text-zinc-500 dark:text-zinc-600 uppercase tracking-widest mb-1 transition-colors">Seller (Vendor)</span>
                <span className="text-zinc-900 dark:text-white font-mono text-[11px] sm:text-xs transition-colors truncate">{truncAddr(trade.seller)}</span>
              </div>
              {isSeller && <span className="text-[10px] font-black bg-zinc-900 dark:bg-white text-white dark:text-black px-2.5 py-1 rounded-full shrink-0">YOU</span>}
            </div>
          </div>
        </div>

        {/* Action Panel */}
        {!trade.released && (isBuyer || isSeller) && (
          <div className="mt-8 sm:mt-12 p-5 sm:p-6 md:p-8 rounded-[2rem] sm:rounded-[2.5rem] bg-gradient-to-b from-zinc-100/50 dark:from-zinc-800/20 to-transparent border border-zinc-200 dark:border-zinc-800 transition-colors">
            <h3 className="text-sm font-black text-zinc-900 dark:text-white uppercase tracking-[0.3em] mb-5 sm:mb-6 text-center transition-colors">Settlement Actions</h3>
            <div className="flex flex-col gap-3 sm:gap-4">

              {isBuyer && !trade.sellerApprovedRefund && (
                <button
                  onClick={() => executeAction("releaseToSeller")}
                  disabled={actionLoading}
                  className="w-full flex items-center justify-center px-6 sm:px-8 py-4 sm:py-5 bg-zinc-900 dark:bg-white text-white dark:text-black font-black uppercase tracking-widest rounded-xl sm:rounded-2xl hover:bg-zinc-800 dark:hover:bg-zinc-200 transition-all disabled:opacity-50 active:scale-[0.98] text-sm"
                >
                  {actionLoading ? <Loader2 className="w-5 h-5 animate-spin mr-3" /> : null}
                  Confirm Delivery & Release MON
                </button>
              )}

              {isSeller && !trade.sellerApprovedRefund && (
                <button
                  onClick={() => executeAction("sellerApproveRefund")}
                  disabled={actionLoading}
                  className="w-full flex items-center justify-center px-6 sm:px-8 py-4 sm:py-5 bg-zinc-200 dark:bg-zinc-800 text-zinc-900 dark:text-white font-black uppercase tracking-widest rounded-xl sm:rounded-2xl hover:bg-zinc-300 dark:hover:bg-zinc-700 transition-all disabled:opacity-50 active:scale-[0.98] text-sm"
                >
                  {actionLoading ? <Loader2 className="w-5 h-5 animate-spin mr-3" /> : null}
                  Authorize Return of Funds
                </button>
              )}

              {isBuyer && trade.sellerApprovedRefund && (
                <button
                  onClick={() => executeAction("buyerClaimRefund")}
                  disabled={actionLoading}
                  className="w-full flex items-center justify-center px-6 sm:px-8 py-4 sm:py-5 bg-zinc-900 dark:bg-white text-white dark:text-black font-black uppercase tracking-widest rounded-xl sm:rounded-2xl hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-50 shadow-xl text-sm"
                >
                  {actionLoading ? <Loader2 className="w-5 h-5 animate-spin mr-3" /> : null}
                  Withdraw Refund
                </button>
              )}

              <Link
                href={`/trade/${idStr}/chat`}
                className="w-full flex items-center justify-center px-6 sm:px-8 py-4 sm:py-5 bg-transparent border-2 border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400 font-black uppercase tracking-widest rounded-xl sm:rounded-2xl hover:bg-zinc-100 dark:hover:bg-zinc-800/50 transition-all text-sm"
              >
                Resolve Issues
              </Link>

              {!isBuyer && !isSeller && (
                <p className="text-center text-zinc-500 dark:text-zinc-600 text-xs italic">You are viewing this trade as an observer.</p>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}