"use client";

import { useCallback, useState } from "react";
import { usePolling } from "@/lib/usePolling";
import Link from "next/link";
import { ArrowDownToLine, ArrowUpFromLine, ShieldCheck, ArrowRight } from "lucide-react";
import Logo from "@/components/Logo";

type Coin = { symbol: string; name: string; ngn: number };

export default function ExchangeHome() {
  const [coins, setCoins] = useState<Coin[]>([]);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/exchange/rates");
      if (res.ok) {
        const data = await res.json();
        setCoins(data.coins ?? []);
      }
    } catch { /* silent */ }
  }, []);

  usePolling(load, 30_000);

  const mon = coins.find((c) => c.symbol === "MON");

  return (
    <div className="flex-1 flex flex-col relative overflow-hidden transition-colors duration-300">
      {/* Background gradients (same family as the escrow home) */}
      <div className="bg-ambient absolute top-0 inset-x-0 h-full overflow-hidden pointer-events-none -z-10" />

      <main className="flex-1 flex flex-col items-center justify-center text-center px-5 py-14 sm:py-24 w-full max-w-3xl mx-auto z-10">
        {/* Affiliation badge */}
        <div className="anim-fade-up inline-flex items-center justify-center px-3 py-1.5 mb-6 sm:mb-8 rounded-full border border-zinc-200 dark:border-white/20 bg-zinc-100/50 dark:bg-white/5 text-zinc-600 dark:text-zinc-300 text-xs sm:text-sm font-medium backdrop-blur-md gap-2">
          <ShieldCheck className="w-3.5 h-3.5 text-zinc-900 dark:text-white" />
          A VeriPay product · Escrow-grade security
        </div>

        <h1 className="anim-fade-up anim-delay-1 text-4xl sm:text-5xl md:text-6xl font-extrabold tracking-tight mb-5 sm:mb-6 leading-[1.1] text-zinc-900 dark:text-white">
          Naira in.{" "}
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-zinc-900 via-zinc-500 to-zinc-400 dark:from-white dark:via-zinc-400 dark:to-zinc-600">
            Crypto out.
          </span>
        </h1>

        <p className="anim-fade-up anim-delay-2 text-base sm:text-lg text-zinc-600 dark:text-zinc-400 max-w-xl mb-9 sm:mb-12 leading-relaxed px-2">
          Buy and sell Monad — or any major crypto — with your local bank account.
          No order books, no jargon. Two taps and you&apos;re done.
        </p>

        {/* The two buttons */}
        <div className="anim-fade-up anim-delay-3 flex flex-col sm:flex-row gap-3 sm:gap-4 w-full max-w-md justify-center">
          <Link
            href="/exchange/buy"
            className="flex-1 flex items-center justify-center gap-2.5 px-7 py-5 rounded-3xl bg-zinc-900 dark:bg-white text-white dark:text-black font-black uppercase tracking-widest text-sm hover:scale-[1.03] active:scale-[0.97] transition-all duration-300 shadow-xl"
          >
            <ArrowDownToLine className="w-5 h-5" />
            Buy Crypto
          </Link>
          <Link
            href="/exchange/sell"
            className="flex-1 flex items-center justify-center gap-2.5 px-7 py-5 rounded-3xl bg-white dark:bg-zinc-900 border-2 border-zinc-900 dark:border-white text-zinc-900 dark:text-white font-black uppercase tracking-widest text-sm hover:scale-[1.03] active:scale-[0.97] transition-all duration-300"
          >
            <ArrowUpFromLine className="w-5 h-5" />
            Sell Crypto
          </Link>
        </div>

        {/* Live MON rate */}
        {mon && (
          <div className="anim-fade-up anim-delay-4 mt-9 sm:mt-12 flex items-center gap-2 text-sm text-zinc-500 dark:text-zinc-400">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-zinc-500 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-zinc-900 dark:bg-white" />
            </span>
            1 MON ≈{" "}
            <span className="font-bold text-zinc-900 dark:text-white">
              ₦{mon.ngn.toLocaleString("en-NG", { maximumFractionDigits: 2 })}
            </span>
          </div>
        )}

        {/* Rate ticker */}
        {coins.length > 0 && (
          <div className="anim-fade-up anim-delay-5 mt-8 w-full grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            {coins
              .filter((c) => c.symbol !== "MON")
              .map((c) => (
                <div
                  key={c.symbol}
                  className="px-3 py-3 rounded-2xl bg-white/60 dark:bg-zinc-900/50 border border-zinc-200 dark:border-zinc-800 backdrop-blur-sm text-left transition-all duration-500 hover:-translate-y-1"
                >
                  <p className="text-[10px] font-black uppercase tracking-widest text-zinc-400">{c.symbol}</p>
                  <p className="text-xs sm:text-sm font-bold text-zinc-900 dark:text-white mt-0.5 truncate">
                    ₦{c.ngn.toLocaleString("en-NG", { maximumFractionDigits: 0 })}
                  </p>
                </div>
              ))}
          </div>
        )}
      </main>

      {/* Escrow cross-link */}
      <section className="py-8 sm:py-10 px-5 border-t border-zinc-200 dark:border-zinc-900 bg-white/40 dark:bg-black/40 backdrop-blur-sm z-10">
        <Link
          href="/"
          className="group max-w-3xl mx-auto flex items-center justify-between gap-4 p-5 sm:p-6 rounded-3xl bg-zinc-50 dark:bg-zinc-900/50 border border-zinc-200 dark:border-zinc-800 hover:border-zinc-400 dark:hover:border-zinc-500 transition-all duration-500"
        >
          <div className="flex items-center gap-4 text-left">
            <Logo className="w-11 h-11 shrink-0" />
            <div>
              <p className="text-sm sm:text-base font-bold text-zinc-900 dark:text-white">
                Trading goods or services? Use VeriPay Escrow
              </p>
              <p className="text-xs sm:text-sm text-zinc-500 dark:text-zinc-400 mt-0.5">
                Lock funds in a smart contract until both sides are satisfied.
              </p>
            </div>
          </div>
          <ArrowRight className="w-5 h-5 text-zinc-400 group-hover:text-zinc-900 dark:group-hover:text-white group-hover:translate-x-1 transition-all duration-300 shrink-0" />
        </Link>
      </section>
    </div>
  );
}
