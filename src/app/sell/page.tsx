"use client";

import { useEffect, useState } from "react";
import { useActiveAccount } from "thirdweb/react";
import { createPublicClient, http, formatUnits } from "viem";
import { Loader2, Fingerprint, Copy, Check, Share2 } from "lucide-react";
import { useSignIn } from "@/lib/useSignIn";
import { claimMessage, normaliseHandle } from "@/lib/sellerShared";
import { MONAD_RPC_URL, NGN_TOKEN_ADDRESS, NGN_TOKEN_DECIMALS, erc20Abi } from "@/lib/monad";
import SellerReputationCard from "@/components/SellerReputationCard";
import OrdersList from "@/components/OrdersList";

type Seller = { handle: string; name: string; address: string };

const input = "w-full bg-white dark:bg-black/50 border border-zinc-200 dark:border-zinc-800 rounded-2xl px-4 py-4 text-zinc-900 dark:text-white text-sm focus:outline-none focus:border-zinc-500 placeholder:text-zinc-400 dark:placeholder:text-zinc-700";
const label = "text-xs font-black uppercase tracking-widest text-zinc-500 ml-1";
const card = "w-full bg-zinc-50 dark:bg-zinc-900/40 border border-zinc-200 dark:border-zinc-800 rounded-[2rem] p-5 sm:p-8";
const primary = "py-4 rounded-2xl bg-zinc-900 dark:bg-white text-white dark:text-black font-black uppercase tracking-widest text-sm flex items-center justify-center gap-2 disabled:opacity-60";

export default function Sell() {
  const account = useActiveAccount();
  const signIn = useSignIn();
  const [seller, setSeller] = useState<Seller | null | undefined>(undefined);
  const [name, setName] = useState("");
  const [handle, setHandle] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [received, setReceived] = useState<string | null>(null);

  useEffect(() => {
    if (!account) { setSeller(undefined); return; }
    fetch(`/api/sellers?address=${account.address}`).then((r) => r.json()).then((d) => setSeller(d.seller ?? null)).catch(() => setSeller(null));
    createPublicClient({ transport: http(MONAD_RPC_URL) })
      .readContract({ address: NGN_TOKEN_ADDRESS, abi: erc20Abi, functionName: "balanceOf", args: [account.address as `0x${string}`] })
      .then((b) => setReceived(Number(formatUnits(b as bigint, NGN_TOKEN_DECIMALS)).toLocaleString("en-NG", { maximumFractionDigits: 2 })))
      .catch(() => {});
  }, [account]);

  const clean = normaliseHandle(handle);
  const link = seller && typeof window !== "undefined" ? `${window.location.origin}/pay/${seller.handle}` : "";

  const claim = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!account) return;
    setSaving(true); setError("");
    try {
      const signature = await account.signMessage({ message: claimMessage(clean, account.address) });
      const res = await fetch("/api/sellers", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ handle: clean, name, address: account.address, signature }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Couldn't save your link.");
      setSeller(data.seller);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save your link.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col items-center py-8 sm:py-14 px-4 w-full max-w-md mx-auto gap-4">
      <div className={card}>
        <h1 className="text-2xl sm:text-3xl font-black text-zinc-900 dark:text-white tracking-tight mb-2">
          {seller ? "Your payment link" : "Get your payment link"}
        </h1>
        <p className="text-sm text-zinc-600 dark:text-zinc-400 leading-relaxed mb-6">
          {seller
            ? "Put this in your Instagram bio or send it on WhatsApp. Buyers pay through it; you're paid when they confirm delivery."
            : "One link for your Instagram bio or WhatsApp. Buyers see your real track record and pay safely — so they stop asking “how do I know you won't run with my money?”"}
        </p>

        {!account ? (
          <div className="flex flex-col gap-2">
            {signIn.passkeySupported && (
              <button onClick={signIn.withPasskey} disabled={signIn.busy} className={primary}>
                {signIn.busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Fingerprint className="w-4 h-4 shrink-0" />}
                Use Face ID / fingerprint
              </button>
            )}
            <button onClick={signIn.withOther} className="py-3.5 rounded-2xl border border-zinc-200 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300 font-bold text-sm">
              {signIn.passkeySupported ? "Other ways to sign in" : "Sign in"}
            </button>
            {signIn.error && <p className="text-xs text-zinc-500 leading-relaxed">{signIn.error}</p>}
          </div>
        ) : seller === undefined ? (
          <Loader2 className="w-5 h-5 animate-spin text-zinc-500" />
        ) : seller ? (
          <div className="flex flex-col gap-3">
            <div className="p-4 rounded-2xl bg-white dark:bg-black/50 border border-zinc-200 dark:border-zinc-800 font-mono text-xs sm:text-sm text-zinc-900 dark:text-white break-all">{link}</div>
            <button onClick={() => { navigator.clipboard.writeText(link); setCopied(true); setTimeout(() => setCopied(false), 2000); }} className={primary}>
              {copied ? <><Check className="w-4 h-4" /> Copied</> : <><Copy className="w-4 h-4" /> Copy link</>}
            </button>
            <a
              href={`https://wa.me/?text=${encodeURIComponent(`Pay me safely with VeriPay — your money is held until you confirm delivery: ${link}`)}`}
              target="_blank" rel="noreferrer"
              className="py-3.5 rounded-2xl border border-zinc-200 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300 font-bold text-sm flex items-center justify-center gap-2"
            >
              <Share2 className="w-4 h-4" /> Share on WhatsApp
            </a>
          </div>
        ) : (
          <form onSubmit={claim} className="flex flex-col gap-4">
            {error && <div className="p-4 rounded-2xl bg-zinc-100 dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 text-sm text-zinc-900 dark:text-white">{error}</div>}
            <div className="flex flex-col gap-2">
              <label className={label}>Shop name</label>
              <input required minLength={2} maxLength={60} placeholder="Adaeze Thrift" value={name} onChange={(e) => setName(e.target.value)} className={input} />
            </div>
            <div className="flex flex-col gap-2">
              <label className={label}>Link name</label>
              <input required placeholder="adaeze-thrift" value={handle} onChange={(e) => setHandle(e.target.value)} className={`${input} font-mono`} />
              {clean && <p className="text-[11px] text-zinc-500 ml-1 break-all">veripay.store/pay/<span className="font-bold text-zinc-900 dark:text-white">{clean}</span></p>}
            </div>
            <button type="submit" disabled={saving} className={primary}>
              {saving && <Loader2 className="w-4 h-4 animate-spin" />} Create my link
            </button>
          </form>
        )}
      </div>

      {account && seller && (
        <div className={card}>
          <p className="text-xs font-black uppercase tracking-widest text-zinc-500 mb-2">Your orders</p>
          <OrdersList address={seller.address} role="seller" empty="No orders yet. When a buyer pays through your link, it appears here straight away." />
        </div>
      )}

      {account && seller && (
        <div className={card}>
          <SellerReputationCard address={seller.address} />
          {received !== null && (
            <p className="mt-4 text-sm text-zinc-600 dark:text-zinc-400 leading-relaxed">
              <span className="font-black text-zinc-900 dark:text-white">₦{received}</span> paid out to you so far.
              This is the test version, so it&apos;s test money — bank withdrawals open at launch.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
