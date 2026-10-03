"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";

export default function SellerLookup() {
  const router = useRouter();
  const [address, setAddress] = useState("");
  const valid = /^0x[a-fA-F0-9]{40}$/.test(address);

  return (
    <div className="flex-1 flex flex-col items-center py-12 sm:py-20 px-4 sm:px-6 w-full max-w-xl mx-auto">
      <div className="w-full bg-zinc-50 dark:bg-zinc-900/40 border border-zinc-200 dark:border-zinc-800 rounded-[2rem] p-6 sm:p-10">
        <h1 className="text-2xl sm:text-3xl font-black text-zinc-900 dark:text-white tracking-tight mb-3">Check a seller</h1>
        <p className="text-sm sm:text-base text-zinc-600 dark:text-zinc-400 mb-6 leading-relaxed">
          Paste a vendor&apos;s wallet address to see every VeriPay trade they&apos;ve done — paid out, disputed, refunded.
          It&apos;s read straight from the blockchain, so nobody (including us) can fake or edit it.
        </p>
        <form
          onSubmit={(e) => { e.preventDefault(); if (valid) router.push(`/seller/${address}`); }}
          className="flex flex-col gap-3"
        >
          <input
            value={address} onChange={(e) => setAddress(e.target.value.trim())}
            placeholder="0x..."
            className="bg-white dark:bg-black/50 border border-zinc-200 dark:border-zinc-800 rounded-2xl px-4 py-4 text-zinc-900 dark:text-white font-mono text-sm focus:outline-none focus:border-zinc-500"
          />
          <button
            type="submit" disabled={!valid}
            className="flex items-center justify-center gap-2 py-4 rounded-2xl bg-zinc-900 dark:bg-white text-white dark:text-black font-black uppercase tracking-widest text-sm disabled:opacity-40"
          >
            <Search className="w-4 h-4" /> Check record
          </button>
        </form>
      </div>
    </div>
  );
}
