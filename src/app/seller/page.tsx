"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Search } from "lucide-react";

// Accepts whatever a buyer actually has: the seller's VeriPay link, their
// link name, or (for crypto-native users) an address.
function parse(raw: string): { address?: string; handle?: string } {
  const v = raw.trim();
  if (/^0x[a-fA-F0-9]{40}$/.test(v)) return { address: v };
  const fromLink = v.match(/\/pay\/([a-zA-Z0-9_-]+)/)?.[1];
  const handle = (fromLink ?? v.replace(/^@/, "")).toLowerCase();
  return /^[a-z0-9][a-z0-9_-]{2,29}$/.test(handle) ? { handle } : {};
}

export default function SellerLookup() {
  const router = useRouter();
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const target = parse(value);
  const valid = Boolean(target.address || target.handle);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!valid) return;
    setError("");
    if (target.address) return router.push(`/seller/${target.address}`);
    setBusy(true);
    try {
      const d = await fetch(`/api/sellers?handle=${encodeURIComponent(target.handle!)}`).then((r) => r.json());
      if (d.seller?.address) return router.push(`/seller/${d.seller.address}`);
      setError("No seller has that link. Check the spelling, or ask them to send their VeriPay link again.");
    } catch {
      setError("Couldn't look that up. Check your connection and try again.");
    }
    setBusy(false);
  };

  return (
    <div className="flex-1 flex flex-col items-center py-12 sm:py-20 px-4 sm:px-6 w-full max-w-xl mx-auto">
      <div className="w-full bg-zinc-50 dark:bg-zinc-900/40 border border-zinc-200 dark:border-zinc-800 rounded-[2rem] p-6 sm:p-10">
        <h1 className="text-2xl sm:text-3xl font-black text-zinc-900 dark:text-white tracking-tight mb-3">Check a seller</h1>
        <p className="text-sm sm:text-base text-zinc-600 dark:text-zinc-400 mb-6 leading-relaxed">
          Paste the seller&apos;s VeriPay link or type their link name to see every order they&apos;ve done — paid out,
          disputed, refunded. It&apos;s a public record nobody can fake or edit, including us.
        </p>
        <form onSubmit={submit} className="flex flex-col gap-3">
          <input
            value={value} onChange={(e) => { setValue(e.target.value); setError(""); }}
            placeholder="e.g. adaeze-thrift"
            autoCapitalize="none" autoCorrect="off" spellCheck={false}
            className="bg-white dark:bg-black/50 border border-zinc-200 dark:border-zinc-800 rounded-2xl px-4 py-4 text-zinc-900 dark:text-white text-sm focus:outline-none focus:border-zinc-500 placeholder:text-zinc-400 dark:placeholder:text-zinc-700"
          />
          {error && <p className="text-sm text-zinc-900 dark:text-white">{error}</p>}
          <button
            type="submit" disabled={!valid || busy}
            className="flex items-center justify-center gap-2 py-4 rounded-2xl bg-zinc-900 dark:bg-white text-white dark:text-black font-black uppercase tracking-widest text-sm disabled:opacity-40"
          >
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />} Check record
          </button>
        </form>
      </div>
    </div>
  );
}
