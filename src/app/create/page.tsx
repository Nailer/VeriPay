"use client";

import { useState } from "react";
import { parseEther, createWalletClient, custom, http, createPublicClient } from "viem";
import { useActiveAccount } from "thirdweb/react";
import { CONTRACT_ADDRESS, escrowAbi } from "@/lib/abi";
import { useRouter } from "next/navigation";
import { Loader2, ShieldCheck, ArrowLeft, Camera, CheckCircle2, X } from "lucide-react";
import Link from "next/link";

// Define Monad Testnet Constants
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

    if (!account) {
      setError("Please connect your wallet first.");
      return;
    }

    if (typeof window === "undefined" || !window.ethereum) {
      setError("No browser wallet detected. Please install MetaMask.");
      return;
    }

    setLoading(true);

    try {
      const walletClient = createWalletClient({
        chain: MONAD_CHAIN,
        transport: custom(window.ethereum),
      });

      const publicClient = createPublicClient({
        chain: MONAD_CHAIN,
        transport: http("https://testnet-rpc.monad.xyz"),
      });

      const hash = await walletClient.writeContract({
        address: CONTRACT_ADDRESS,
        abi: escrowAbi,
        functionName: "createTrade",
        args: [seller as `0x${string}`, metadata],
        value: parseEther(amount),
        account: account.address as `0x${string}`,
      });

      const receipt = await publicClient.waitForTransactionReceipt({ 
        hash,
        confirmations: 1 
      });
      
      if (receipt.status === "success") {
        setShowSuccessModal(true); // Trigger the sleek popup
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
    <div className="flex-1 flex flex-col items-center py-20 px-6 relative z-10 w-full max-w-2xl mx-auto transition-colors duration-300">
      {/* Success Modal Backdrop */}
      {showSuccessModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-zinc-900/50 dark:bg-black/80 backdrop-blur-md animate-in fade-in duration-300 transition-colors">
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 w-full max-w-md rounded-[2.5rem] p-8 shadow-2xl relative overflow-hidden animate-in zoom-in-95 duration-300 transition-colors">
            {/* Design Element: Pink Glow */}
            <div className="absolute -top-24 -right-24 w-48 h-48 bg-[#FF007A]/20 blur-[80px]" />
            
            <div className="relative z-10 text-center">
              <div className="w-20 h-20 bg-green-100 dark:bg-green-500/10 rounded-full flex items-center justify-center mx-auto mb-6 border border-green-200 dark:border-green-500/20 transition-colors">
                <CheckCircle2 className="w-10 h-10 text-green-600 dark:text-green-500 transition-colors" />
              </div>

              <h3 className="text-2xl font-black text-zinc-900 dark:text-white mb-2 uppercase tracking-tight transition-colors">Funds Secured!</h3>
              <p className="text-[#FF007A] font-black text-3xl mb-6">{amount} MON</p>
              
              <div className="bg-zinc-50 dark:bg-black/40 rounded-2xl p-4 border border-zinc-200 dark:border-zinc-800 mb-8 text-left transition-colors">
                <div className="flex flex-col gap-3">
                  <div>
                    <span className="text-[10px] font-black text-zinc-500 dark:text-zinc-600 uppercase tracking-[0.2em] block mb-1">Recipient Vendor</span>
                    <span className="text-zinc-700 dark:text-zinc-300 font-mono text-xs break-all leading-relaxed transition-colors">{seller}</span>
                  </div>
                  <div>
                    <span className="text-[10px] font-black text-zinc-500 dark:text-zinc-600 uppercase tracking-[0.2em] block mb-1">Trade Reference</span>
                    <span className="text-zinc-700 dark:text-zinc-300 italic text-sm transition-colors">"{metadata}"</span>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-3 p-4 bg-pink-50 dark:bg-[#FF007A]/10 border border-pink-200 dark:border-[#FF007A]/20 rounded-2xl mb-8 transition-colors">
                <Camera className="w-6 h-6 text-[#FF007A] shrink-0" />
                <p className="text-xs text-zinc-800 dark:text-white font-bold leading-tight text-left transition-colors">
                  IMPORTANT: Please screenshot this receipt and send to the seller to verify your payment or your goods might be delayed!
                </p>
              </div>

              <button 
                onClick={() => router.push("/dashboard")}
                className="w-full py-4 bg-zinc-900 dark:bg-white text-white dark:text-black font-black uppercase tracking-widest rounded-xl hover:bg-zinc-800 dark:hover:bg-zinc-200 transition-all"
              >
                Go to Dashboard
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Back Button */}
      <Link href="/dashboard" className="self-start flex items-center gap-2 text-zinc-500 hover:text-zinc-900 dark:hover:text-white transition-colors mb-8 group">
        <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
        Back to Dashboard
      </Link>

      <div className="w-full bg-zinc-50 dark:bg-zinc-900/40 border border-zinc-200 dark:border-zinc-800 rounded-[2.5rem] p-10 backdrop-blur-xl shadow-2xl transition-colors duration-300">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 bg-pink-50 dark:bg-[#FF007A]/10 rounded-xl flex items-center justify-center transition-colors">
            <ShieldCheck className="w-6 h-6 text-[#FF007A]" />
          </div>
          <h2 className="text-3xl font-black text-zinc-900 dark:text-white tracking-tight transition-colors">New Escrow</h2>
        </div>
        
        <p className="text-zinc-600 dark:text-zinc-400 mb-8 font-medium leading-relaxed transition-colors">
          Lock your funds on Monad. Money is only released when you confirm delivery.
        </p>
        
        {error && (
          <div className="p-4 mb-8 rounded-2xl bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 text-red-600 dark:text-red-400 text-sm font-medium animate-in fade-in slide-in-from-top-2 transition-colors">
            ⚠️ {error}
          </div>
        )}

        <form onSubmit={handleCreate} className="flex flex-col gap-6">
          {/* Seller Address */}
          <div className="flex flex-col gap-2.5">
            <label className="text-xs font-black uppercase tracking-widest text-zinc-500 ml-1">Seller Wallet Address</label>
            <input 
              required
              type="text" 
              placeholder="0x..." 
              value={seller}
              onChange={(e) => setSeller(e.target.value)}
              className="bg-white dark:bg-black/50 border border-zinc-200 dark:border-zinc-800 rounded-2xl px-5 py-4 text-zinc-900 dark:text-white focus:outline-none focus:border-[#FF007A]/50 transition-all placeholder:text-zinc-400 dark:placeholder:text-zinc-700 font-mono text-sm"
            />
          </div>
          
          {/* Amount */}
          <div className="flex flex-col gap-2.5">
            <label className="text-xs font-black uppercase tracking-widest text-zinc-500 ml-1">Amount to Secure (MON)</label>
            <div className="relative">
              <input 
                required
                type="number" 
                step="0.0001"
                placeholder="0.00" 
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="w-full bg-white dark:bg-black/50 border border-zinc-200 dark:border-zinc-800 rounded-2xl px-5 py-4 text-zinc-900 dark:text-white focus:outline-none focus:border-[#FF007A]/50 transition-all placeholder:text-zinc-400 dark:placeholder:text-zinc-700 font-bold text-lg"
              />
              <span className="absolute right-5 top-1/2 -translate-y-1/2 text-zinc-400 dark:text-zinc-600 font-black text-[10px] tracking-widest uppercase transition-colors">Monad Ledger</span>
            </div>
          </div>

          {/* Metadata */}
          <div className="flex flex-col gap-2.5">
            <label className="text-xs font-black uppercase tracking-widest text-zinc-500 ml-1">Trade Terms / Waybill Info</label>
            <textarea 
              required
              placeholder="Describe the item (e.g. iPhone 15 Pro Max, Lagos delivery)..." 
              value={metadata}
              onChange={(e) => setMetadata(e.target.value)}
              className="bg-white dark:bg-black/50 border border-zinc-200 dark:border-zinc-800 rounded-2xl px-5 py-4 text-zinc-900 dark:text-white focus:outline-none focus:border-[#FF007A]/50 transition-all placeholder:text-zinc-400 dark:placeholder:text-zinc-700 min-h-[120px] resize-none text-sm leading-relaxed"
            />
          </div>

          <button 
            type="submit" 
            disabled={loading}
            className="mt-4 relative group overflow-hidden px-8 py-5 rounded-2xl bg-[#FF007A] text-white font-black uppercase tracking-widest hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-xl shadow-pink-500/20"
          >
            <span className="relative z-10 flex items-center justify-center gap-3">
              {loading ? (
                <><Loader2 className="w-5 h-5 animate-spin" /> Securing on Ledger...</>
              ) : (
                "Fund & Secure Trade"
              )}
            </span>
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-1000" />
          </button>
        </form>

        <p className="mt-8 text-center text-[10px] text-zinc-600 uppercase tracking-widest font-bold">
          Protected by Monad-Pay-Lagos Safe-Hand Protocol
        </p>
      </div>
    </div>
  );
}