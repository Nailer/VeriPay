"use client";

import { useState } from "react";
import { parseEther, createWalletClient, custom, http, createPublicClient } from "viem";
import { useActiveAccount } from "thirdweb/react";
import { CONTRACT_ADDRESS, escrowAbi } from "@/lib/abi";
import { useRouter } from "next/navigation";
import { Loader2, ShieldCheck, ArrowLeft, CheckCircle2 } from "lucide-react";
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

export default function CreateTrade() {
  const account = useActiveAccount();
  const router = useRouter();

  const [seller, setSeller] = useState("");
  const [amount, setAmount] = useState("");
  const [metadata, setMetadata] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showSuccessModal, setShowSuccessModal] = useState(false);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!account) { setError("Please connect your wallet first."); return; }
    if (typeof window === "undefined" || !window.ethereum) {
      setError("No browser wallet detected. Please install MetaMask.");
      return;
    }

    setLoading(true);

    try {
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
            setLoading(false);
            return;
          }
        } else {
          setError("Please switch to Monad Testnet in your wallet.");
          setLoading(false);
          return;
        }
      }

      const walletClient = createWalletClient({ chain: MONAD_CHAIN as any, transport: custom(window.ethereum) });
      const publicClient = createPublicClient({ chain: MONAD_CHAIN as any, transport: http("https://testnet-rpc.monad.xyz") });

      const hash = await walletClient.writeContract({
        address: CONTRACT_ADDRESS,
        abi: escrowAbi,
        functionName: "createTrade",
        args: [seller as `0x${string}`, metadata],
        value: parseEther(amount),
        account: account.address as `0x${string}`,
        chain: MONAD_CHAIN as any,
      });

      const receipt = await publicClient.waitForTransactionReceipt({ hash, confirmations: 1 });

      if (receipt.status === "success") {
        // Resolve the just-created trade ID (nextTradeId - 1)
        try {
          const nextIdBig = await publicClient.readContract({
            address: CONTRACT_ADDRESS,
            abi: escrowAbi,
            functionName: "nextTradeId",
          }) as bigint;
          const newTradeId = String(Number(nextIdBig) - 1);

          // Record the trade for analytics/admin tracking
          fetch("/api/trades/log", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              tradeId: newTradeId,
              action: "created",
              actorAddress: account.address,
              txHash: hash,
              buyerAddress: account.address,
              sellerAddress: seller,
              amountWei: parseEther(amount).toString(),
              metadata,
            }),
          }).catch(() => {});

          // Notify the seller in-app
          await fetch("/api/notifications", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              toAddress: seller,
              type: "trade",
              tradeId: newTradeId,
              fromAddress: account.address,
              amount,
            }),
          });
        } catch (notifErr) {
          console.error("Failed to send trade notification:", notifErr);
        }

        setShowSuccessModal(true);
      } else {
        setError("Transaction failed on-chain. Check explorer for details.");
      }
    } catch (err: any) {
      console.error("Create Trade Error:", err);
      const message = err.shortMessage || err.message || "Transaction failed";
      setError(message.includes("User rejected") ? "Transaction cancelled by user." : message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col items-center py-8 sm:py-10 md:py-20 px-4 sm:px-6 relative z-10 w-full max-w-2xl mx-auto transition-colors duration-300">

      {/* Success Modal */}
      {showSuccessModal && (
        <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-6 bg-zinc-900/50 dark:bg-black/80 backdrop-blur-md animate-in fade-in duration-300">
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 w-full sm:max-w-md rounded-t-[2rem] sm:rounded-[2.5rem] p-6 sm:p-8 shadow-2xl relative overflow-hidden animate-in slide-in-from-bottom sm:zoom-in-95 duration-300">
            {/* Glow */}
            <div className="absolute -top-24 -right-24 w-48 h-48 bg-zinc-500/20 blur-[80px]" />

            <div className="relative z-10 text-center">
              {/* Drag handle on mobile */}
              <div className="w-10 h-1 bg-zinc-300 dark:bg-zinc-700 rounded-full mx-auto mb-5 sm:hidden" />

              <div className="w-16 h-16 sm:w-20 sm:h-20 bg-zinc-100 dark:bg-white/10 rounded-full flex items-center justify-center mx-auto mb-5 sm:mb-6 border border-zinc-300 dark:border-white/20">
                <CheckCircle2 className="w-8 h-8 sm:w-10 sm:h-10 text-zinc-900 dark:text-white" />
              </div>

              <h3 className="text-xl sm:text-2xl font-black text-zinc-900 dark:text-white mb-2 uppercase tracking-tight">Funds Secured!</h3>
              <p className="text-zinc-900 dark:text-white font-black text-2xl sm:text-3xl mb-5 sm:mb-6">{amount} MON</p>

              <div className="bg-zinc-50 dark:bg-black/40 rounded-2xl p-4 border border-zinc-200 dark:border-zinc-800 mb-6 text-left">
                <div className="flex flex-col gap-3">
                  <div>
                    <span className="text-[10px] font-black text-zinc-500 dark:text-zinc-600 uppercase tracking-[0.2em] block mb-1">Recipient Vendor</span>
                    <span className="text-zinc-700 dark:text-zinc-300 font-mono text-xs break-all leading-relaxed">{seller}</span>
                  </div>
                  <div>
                    <span className="text-[10px] font-black text-zinc-500 dark:text-zinc-600 uppercase tracking-[0.2em] block mb-1">Trade Reference</span>
                    <span className="text-zinc-700 dark:text-zinc-300 italic text-sm">&quot;{metadata}&quot;</span>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-3 p-4 bg-zinc-100 dark:bg-zinc-800/60 border border-zinc-200 dark:border-zinc-700 rounded-2xl mb-6">
                <CheckCircle2 className="w-5 h-5 text-zinc-900 dark:text-white shrink-0" />
                <p className="text-xs text-zinc-800 dark:text-zinc-200 font-bold leading-tight text-left">
                  ✅ Seller has been notified in-app. No screenshot needed!
                </p>
              </div>

              <button
                onClick={() => router.push("/dashboard")}
                className="w-full py-4 bg-zinc-900 dark:bg-white text-white dark:text-black font-black uppercase tracking-widest rounded-xl hover:bg-zinc-800 dark:hover:bg-zinc-200 transition-all active:scale-[0.98]"
              >
                Go to Dashboard
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Back Button */}
      <Link href="/dashboard" className="self-start flex items-center gap-2 text-zinc-500 hover:text-zinc-900 dark:hover:text-white transition-colors mb-6 sm:mb-8 group text-sm">
        <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
        Back to Dashboard
      </Link>

      <div className="w-full bg-zinc-50 dark:bg-zinc-900/40 border border-zinc-200 dark:border-zinc-800 rounded-[2rem] sm:rounded-[2.5rem] p-5 sm:p-6 md:p-10 shadow-2xl transition-colors duration-300">
        <div className="flex items-center gap-3 mb-3 sm:mb-4">
          <div className="w-9 h-9 sm:w-10 sm:h-10 bg-zinc-100 dark:bg-white/10 rounded-xl flex items-center justify-center">
            <ShieldCheck className="w-5 h-5 sm:w-6 sm:h-6 text-zinc-900 dark:text-white" />
          </div>
          <h2 className="text-2xl sm:text-3xl font-black text-zinc-900 dark:text-white tracking-tight">New Escrow</h2>
        </div>

        <p className="text-sm sm:text-base text-zinc-600 dark:text-zinc-400 mb-6 sm:mb-8 font-medium leading-relaxed">
          Lock your funds on Monad. Money is only released when you confirm delivery.
        </p>

        {error && (
          <div className="p-4 mb-6 sm:mb-8 rounded-2xl bg-zinc-100 dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 text-zinc-900 dark:text-white text-sm font-medium animate-in fade-in slide-in-from-top-2">
            ⚠️ {error}
          </div>
        )}

        <form onSubmit={handleCreate} className="flex flex-col gap-5 sm:gap-6">
          {/* Seller Address */}
          <div className="flex flex-col gap-2">
            <label className="text-xs font-black uppercase tracking-widest text-zinc-500 ml-1">Seller Wallet Address</label>
            <input
              required type="text" placeholder="0x..."
              value={seller} onChange={(e) => setSeller(e.target.value)}
              className="bg-white dark:bg-black/50 border border-zinc-200 dark:border-zinc-800 rounded-2xl px-4 sm:px-5 py-3.5 sm:py-4 text-zinc-900 dark:text-white focus:outline-none focus:border-zinc-500 dark:focus:border-zinc-400 transition-all placeholder:text-zinc-400 dark:placeholder:text-zinc-700 font-mono text-sm"
            />
          </div>

          {/* Amount */}
          <div className="flex flex-col gap-2">
            <label className="text-xs font-black uppercase tracking-widest text-zinc-500 ml-1">Amount to Secure (MON)</label>
            <div className="relative">
              <input
                required type="number" step="0.0001" placeholder="0.00"
                value={amount} onChange={(e) => setAmount(e.target.value)}
                className="w-full bg-white dark:bg-black/50 border border-zinc-200 dark:border-zinc-800 rounded-2xl px-4 sm:px-5 py-3.5 sm:py-4 text-zinc-900 dark:text-white focus:outline-none focus:border-zinc-500 dark:focus:border-zinc-400 transition-all placeholder:text-zinc-400 dark:placeholder:text-zinc-700 font-bold text-base sm:text-lg"
              />
              <span className="absolute right-4 sm:right-5 top-1/2 -translate-y-1/2 text-zinc-400 dark:text-zinc-600 font-black text-[9px] sm:text-[10px] tracking-widest uppercase hidden xs:block">Monad Ledger</span>
            </div>
          </div>

          {/* Metadata */}
          <div className="flex flex-col gap-2">
            <label className="text-xs font-black uppercase tracking-widest text-zinc-500 ml-1">Trade Terms / Waybill Info</label>
            <textarea
              required
              placeholder="Describe the item (e.g. iPhone 15 Pro Max, Lagos delivery)..."
              value={metadata} onChange={(e) => setMetadata(e.target.value)}
              className="bg-white dark:bg-black/50 border border-zinc-200 dark:border-zinc-800 rounded-2xl px-4 sm:px-5 py-3.5 sm:py-4 text-zinc-900 dark:text-white focus:outline-none focus:border-zinc-500 dark:focus:border-zinc-400 transition-all placeholder:text-zinc-400 dark:placeholder:text-zinc-700 min-h-[100px] sm:min-h-[120px] resize-none text-sm leading-relaxed"
            />
          </div>

          <button
            type="submit" disabled={loading}
            className="mt-2 relative group overflow-hidden px-6 sm:px-8 py-4 sm:py-5 rounded-2xl bg-zinc-900 dark:bg-white text-white dark:text-black font-black uppercase tracking-widest hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-xl"
          >
            <span className="relative z-10 flex items-center justify-center gap-3 text-sm sm:text-base">
              {loading ? <><Loader2 className="w-5 h-5 animate-spin" /> Securing on Ledger...</> : "Fund & Secure Trade"}
            </span>
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-1000" />
          </button>
        </form>

        <p className="mt-6 sm:mt-8 text-center text-[10px] text-zinc-600 uppercase tracking-widest font-bold">
          Protected by the VeriPay Safe-Hand Protocol
        </p>
      </div>
    </div>
  );
}