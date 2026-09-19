"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import { useActiveAccount } from "thirdweb/react";
import { createPublicClient, http, formatEther } from "viem";
import { prepareContractCall, sendTransaction, waitForReceipt } from "thirdweb";
import { escrowContract, friendlyTxError, MONAD_RPC_URL } from "@/lib/monad";
import { readTrade, type EscrowTrade } from "@/lib/escrow";
import {
  Loader2, ShieldAlert, CheckCircle2, ArrowLeft, Info, HelpCircle,
  AlertTriangle, Clock, Scale, RotateCcw,
} from "lucide-react";
import Link from "next/link";
import ReputationBadge from "@/components/ReputationBadge";

const MONAD_CHAIN = {
  id: 10143,
  name: "Monad Testnet",
  nativeCurrency: { name: "MON", symbol: "MON", decimals: 18 },
  rpcUrls: {
    default: { http: [MONAD_RPC_URL] },
    public: { http: [MONAD_RPC_URL] },
  },
};

type TradeData = EscrowTrade;

type Action =
  | "releaseToSeller"
  | "sellerApproveRefund"
  | "buyerClaimRefund"
  | "raiseDispute"
  | "autoRelease";

export default function TradeDetail() {
  const params = useParams();
  const idStr = params?.id as string;
  const tradeId = idStr ? BigInt(idStr) : BigInt(0);

  const account = useActiveAccount();
  const [trade, setTrade] = useState<TradeData | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<Action | "">("");
  const [error, setError] = useState("");
  const [confirmDispute, setConfirmDispute] = useState(false);
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));

  const fetchTrade = useCallback(async () => {
    if (!idStr) return;
    try {
      const publicClient = createPublicClient({
        chain: MONAD_CHAIN as any,
        transport: http(MONAD_RPC_URL),
      });

      // Handles both the old and new contract shapes.
      setTrade(await readTrade(publicClient as any, tradeId));
    } catch (err) {
      console.error(err);
      setError("Failed to fetch trade details from Monad.");
    } finally {
      setLoading(false);
    }
  }, [idStr, tradeId]);

  useEffect(() => { fetchTrade(); }, [fetchTrade]);

  // Drives the auto-release countdown.
  useEffect(() => {
    const t = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 30_000);
    return () => clearInterval(t);
  }, []);

  const executeAction = async (functionName: Action) => {
    if (!account) {
      setError("Please connect your wallet first.");
      return;
    }

    setActionLoading(functionName);
    setError("");

    try {
      // Sent through thirdweb's own pipeline — works for browser-extension
      // wallets, thirdweb's in-app (email/social) wallet, and mobile wallets
      // over WalletConnect alike. No window.ethereum needed.
      const transaction = prepareContractCall({
        contract: escrowContract,
        method: functionName,
        params: [tradeId],
      });

      const result = await sendTransaction({ account, transaction });
      await waitForReceipt(result);

      const actionMap: Partial<Record<Action, string>> = {
        releaseToSeller: "released",
        sellerApproveRefund: "refund_approved",
        buyerClaimRefund: "refund_claimed",
        autoRelease: "released",
      };
      const logged = actionMap[functionName];
      if (logged) {
        fetch("/api/trades/log", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            tradeId: idStr, action: logged, actorAddress: account.address, txHash: result.transactionHash,
          }),
        }).catch(() => {});
      }

      // Tell an agent a dispute was opened so it shows up in the console.
      if (functionName === "raiseDispute") {
        fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            tradeId: idStr,
            sender: "System",
            address: account.address,
            text: `A dispute was opened on this trade by ${account.address}. Funds are frozen until an agent reviews it.`,
          }),
        }).catch(() => {});
        setConfirmDispute(false);
      }

      await fetchTrade();
    } catch (err: unknown) {
      console.error(err);
      setError(friendlyTxError(err));
    } finally {
      setActionLoading("");
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
  const isParty = isBuyer || isSeller;
  const settled = trade.released || trade.refunded;

  const truncAddr = (addr: string) => `${addr.slice(0, 8)}...${addr.slice(-6)}`;

  // What the seller actually walks away with, after the platform fee.
  const feePct = trade.feeBps / 100;
  const feeWei = (trade.amount * BigInt(trade.feeBps)) / BigInt(10000);
  const sellerNet = trade.amount - feeWei;

  const secondsLeft = Number(trade.autoReleaseAt) - now;
  const windowPassed = secondsLeft <= 0;
  const countdown = (() => {
    if (windowPassed) return "elapsed";
    const d = Math.floor(secondsLeft / 86400);
    const h = Math.floor((secondsLeft % 86400) / 3600);
    if (d > 0) return `${d}d ${h}h`;
    const m = Math.floor((secondsLeft % 3600) / 60);
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
  })();

  const statusLabel = trade.refunded
    ? "Refunded"
    : trade.released
      ? "Settled"
      : trade.disputed
        ? "In Dispute"
        : trade.sellerApprovedRefund
          ? "Refund Ready"
          : "Funds Escrowed";

  const busy = actionLoading !== "";

  return (
    <div className="flex-1 flex flex-col items-center py-6 sm:py-8 md:py-16 px-4 sm:px-6 relative z-10 w-full max-w-3xl mx-auto transition-colors duration-300">

      {/* Top bar */}
      <div className="w-full mb-6 sm:mb-8 flex items-center justify-between">
        <Link href="/dashboard" className="inline-flex items-center gap-2 text-zinc-600 dark:text-zinc-500 hover:text-zinc-900 dark:hover:text-white transition-colors font-bold uppercase tracking-widest text-[10px]">
          <ArrowLeft className="w-4 h-4" /> Back to Ledger
        </Link>
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${settled ? "bg-zinc-400 dark:bg-zinc-500" : "bg-zinc-900 dark:bg-white animate-pulse"}`} />
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
            trade.disputed && !settled
              ? "bg-zinc-900 dark:bg-white text-white dark:text-black border-zinc-900 dark:border-white"
              : settled
                ? "bg-zinc-900 dark:bg-white text-white dark:text-black border-zinc-900 dark:border-white"
                : trade.sellerApprovedRefund
                  ? "bg-white dark:bg-black text-zinc-900 dark:text-white border-zinc-400 dark:border-zinc-500"
                  : "bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-white border-zinc-300 dark:border-zinc-600"
          }`}>
            {statusLabel}
          </div>
        </div>

        {error && (
          <div className="p-4 mb-6 sm:mb-8 rounded-2xl bg-zinc-100 dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 text-zinc-900 dark:text-white text-sm font-medium">
            ⚠️ {error}
          </div>
        )}

        {/* Dispute banner */}
        {trade.disputed && !settled && (
          <div className="mb-6 sm:mb-8 p-5 rounded-2xl bg-zinc-900 dark:bg-white text-white dark:text-black flex items-start gap-3">
            <Scale className="w-5 h-5 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-black uppercase tracking-wide">Under review</p>
              <p className="text-xs mt-1 leading-relaxed opacity-80">
                This trade is disputed, so the funds are frozen — nobody can move them until an
                agent decides. Explain what happened in the chat below; that&apos;s what the
                decision is based on.
              </p>
            </div>
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
              {trade.feeBps > 0 && !settled && (
                <span className="text-[10px] text-zinc-500 mt-2 leading-relaxed">
                  Seller receives {formatEther(sellerNet)} MON after the {feePct}% fee.
                  Refunds are returned in full.
                </span>
              )}
              {trade.legacy && !settled && (
                <span className="text-[10px] text-zinc-500 mt-2 leading-relaxed">
                  This trade is on the original contract — no fee, and disputes
                  aren&apos;t available on it.
                </span>
              )}
            </div>

            <div className="p-4 sm:p-6 md:p-8 rounded-[1.5rem] sm:rounded-[2rem] bg-white dark:bg-black/40 border border-zinc-200 dark:border-zinc-800 flex flex-col justify-center transition-colors">
              <span className="text-[10px] font-black text-zinc-500 dark:text-zinc-600 uppercase tracking-widest mb-1.5 transition-colors">Status</span>
              {trade.refunded ? (
                <div className="flex items-center gap-2 text-zinc-900 dark:text-white font-black uppercase tracking-widest text-[10px] sm:text-xs">
                  <RotateCcw className="w-5 h-5 sm:w-6 sm:h-6 shrink-0" /> Returned
                </div>
              ) : trade.released ? (
                <div className="flex items-center gap-2 text-zinc-900 dark:text-white font-black uppercase tracking-widest text-[10px] sm:text-xs">
                  <CheckCircle2 className="w-5 h-5 sm:w-6 sm:h-6 shrink-0" /> Concluded
                </div>
              ) : trade.disputed ? (
                <div className="flex items-center gap-2 text-zinc-900 dark:text-white font-black uppercase tracking-widest text-[10px] sm:text-xs">
                  <Scale className="w-5 h-5 sm:w-6 sm:h-6 shrink-0" /> Frozen
                </div>
              ) : (
                <div className="flex items-center gap-2 text-zinc-700 dark:text-zinc-300 font-black uppercase tracking-widest text-[10px] sm:text-xs">
                  <ShieldAlert className="w-5 h-5 sm:w-6 sm:h-6 animate-pulse shrink-0" /> Protected
                </div>
              )}
            </div>
          </div>

          {/* Auto-release window (v2 contract only) */}
          {!settled && !trade.disputed && !trade.legacy && trade.autoReleaseAt > BigInt(0) && (
            <div className="flex items-start gap-3 p-4 rounded-2xl bg-white dark:bg-black/40 border border-zinc-200 dark:border-zinc-800">
              <Clock className="w-4 h-4 text-zinc-500 shrink-0 mt-0.5" />
              <p className="text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed">
                {windowPassed ? (
                  <>
                    The buyer&apos;s confirmation window has passed. The seller can now claim the
                    funds, unless someone opens a dispute first.
                  </>
                ) : (
                  <>
                    <span className="font-bold text-zinc-900 dark:text-white">{countdown} left</span> for
                    the buyer to confirm delivery. After that the seller can claim the funds, so a
                    buyer who is unhappy should open a dispute before then.
                  </>
                )}
              </p>
            </div>
          )}

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
              <div className="flex flex-col min-w-0 gap-1.5">
                <span className="text-[10px] font-black text-zinc-500 dark:text-zinc-600 uppercase tracking-widest transition-colors">Seller (Vendor)</span>
                <span className="text-zinc-900 dark:text-white font-mono text-[11px] sm:text-xs transition-colors truncate">{truncAddr(trade.seller)}</span>
                <ReputationBadge address={trade.seller} />
              </div>
              {isSeller && <span className="text-[10px] font-black bg-zinc-900 dark:bg-white text-white dark:text-black px-2.5 py-1 rounded-full shrink-0">YOU</span>}
            </div>
          </div>
        </div>

        {/* Action Panel */}
        {!settled && isParty && (
          <div className="mt-8 sm:mt-12 p-5 sm:p-6 md:p-8 rounded-[2rem] sm:rounded-[2.5rem] bg-gradient-to-b from-zinc-100/50 dark:from-zinc-800/20 to-transparent border border-zinc-200 dark:border-zinc-800 transition-colors">
            <h3 className="text-sm font-black text-zinc-900 dark:text-white uppercase tracking-[0.3em] mb-5 sm:mb-6 text-center transition-colors">Settlement Actions</h3>
            <div className="flex flex-col gap-3 sm:gap-4">

              {isBuyer && !trade.sellerApprovedRefund && (
                <button
                  onClick={() => executeAction("releaseToSeller")}
                  disabled={busy}
                  className="w-full flex items-center justify-center px-6 sm:px-8 py-4 sm:py-5 bg-zinc-900 dark:bg-white text-white dark:text-black font-black uppercase tracking-widest rounded-xl sm:rounded-2xl hover:bg-zinc-800 dark:hover:bg-zinc-200 transition-all disabled:opacity-50 active:scale-[0.98] text-sm"
                >
                  {actionLoading === "releaseToSeller" && <Loader2 className="w-5 h-5 animate-spin mr-3" />}
                  Confirm Delivery &amp; Release MON
                </button>
              )}

              {isSeller && !trade.sellerApprovedRefund && (
                <button
                  onClick={() => executeAction("sellerApproveRefund")}
                  disabled={busy}
                  className="w-full flex items-center justify-center px-6 sm:px-8 py-4 sm:py-5 bg-zinc-200 dark:bg-zinc-800 text-zinc-900 dark:text-white font-black uppercase tracking-widest rounded-xl sm:rounded-2xl hover:bg-zinc-300 dark:hover:bg-zinc-700 transition-all disabled:opacity-50 active:scale-[0.98] text-sm"
                >
                  {actionLoading === "sellerApproveRefund" && <Loader2 className="w-5 h-5 animate-spin mr-3" />}
                  Authorize Return of Funds
                </button>
              )}

              {isBuyer && trade.sellerApprovedRefund && (
                <button
                  onClick={() => executeAction("buyerClaimRefund")}
                  disabled={busy}
                  className="w-full flex items-center justify-center px-6 sm:px-8 py-4 sm:py-5 bg-zinc-900 dark:bg-white text-white dark:text-black font-black uppercase tracking-widest rounded-xl sm:rounded-2xl hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-50 shadow-xl text-sm"
                >
                  {actionLoading === "buyerClaimRefund" && <Loader2 className="w-5 h-5 animate-spin mr-3" />}
                  Withdraw Refund
                </button>
              )}

              {/* Seller claims funds once the buyer's window lapses */}
              {isSeller && !trade.legacy && windowPassed && !trade.disputed && (
                <button
                  onClick={() => executeAction("autoRelease")}
                  disabled={busy}
                  className="w-full flex items-center justify-center px-6 sm:px-8 py-4 sm:py-5 bg-zinc-900 dark:bg-white text-white dark:text-black font-black uppercase tracking-widest rounded-xl sm:rounded-2xl hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-50 shadow-xl text-sm"
                >
                  {actionLoading === "autoRelease" && <Loader2 className="w-5 h-5 animate-spin mr-3" />}
                  Claim Funds (window elapsed)
                </button>
              )}

              <Link
                href={`/trade/${idStr}/chat`}
                className="w-full flex items-center justify-center px-6 sm:px-8 py-4 sm:py-5 bg-transparent border-2 border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400 font-black uppercase tracking-widest rounded-xl sm:rounded-2xl hover:bg-zinc-100 dark:hover:bg-zinc-800/50 transition-all text-sm"
              >
                Message the other party
              </Link>

              {/* Dispute (v2 contract only) */}
              {!trade.disputed && !trade.legacy && (
                confirmDispute ? (
                  <div className="p-5 rounded-2xl bg-white dark:bg-black/40 border-2 border-zinc-900 dark:border-white">
                    <div className="flex items-start gap-2.5 mb-4">
                      <AlertTriangle className="w-4 h-4 text-zinc-900 dark:text-white shrink-0 mt-0.5" />
                      <p className="text-xs text-zinc-700 dark:text-zinc-300 leading-relaxed">
                        This freezes the funds. Neither of you can release or refund until an
                        agent reviews the trade and decides how to split it. Use this when talking
                        it out hasn&apos;t worked.
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => executeAction("raiseDispute")}
                        disabled={busy}
                        className="flex-1 py-3.5 rounded-xl bg-zinc-900 dark:bg-white text-white dark:text-black font-black uppercase tracking-widest text-[11px] disabled:opacity-50 flex items-center justify-center gap-2"
                      >
                        {actionLoading === "raiseDispute" && <Loader2 className="w-4 h-4 animate-spin" />}
                        Freeze &amp; request review
                      </button>
                      <button
                        onClick={() => setConfirmDispute(false)}
                        disabled={busy}
                        className="flex-1 py-3.5 rounded-xl bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 font-black uppercase tracking-widest text-[11px]"
                      >
                        Never mind
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={() => setConfirmDispute(true)}
                    disabled={busy}
                    className="w-full py-3 text-[11px] font-black uppercase tracking-widest text-zinc-400 hover:text-zinc-900 dark:hover:text-white underline underline-offset-4 transition-colors"
                  >
                    Report a problem with this trade
                  </button>
                )
              )}
            </div>
          </div>
        )}

        {/* Observer note */}
        {!isParty && (
          <p className="mt-8 text-center text-zinc-500 dark:text-zinc-600 text-xs italic">
            You are viewing this trade as an observer.
          </p>
        )}
      </div>
    </div>
  );
}
