"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActiveAccount } from "thirdweb/react";
import { ArrowLeft, ArrowDownToLine, Loader2, Wallet } from "lucide-react";

type Coin = { symbol: string; name: string; ngn: number };

const FEE_RATE = 0.005; // 0.5% platform fee
const MIN_FEE_NGN = 100;
const MIN_NGN = 1000;

export default function BuyPage() {
  const router = useRouter();
  const account = useActiveAccount();

  const [coins, setCoins] = useState<Coin[]>([]);
  const [coin, setCoin] = useState("MON");
  const [ngnInput, setNgnInput] = useState("");
  const [destAddress, setDestAddress] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/exchange/rates")
      .then((r) => r.json())
      .then((d) => setCoins(d.coins ?? []))
      .catch(() => {});
  }, []);

  const selected = coins.find((c) => c.symbol === coin);
  const ngn = parseFloat(ngnInput) || 0;
  const fee = ngn > 0 ? Math.max(ngn * FEE_RATE, MIN_FEE_NGN) : 0;
  const cryptoOut = useMemo(() => {
    if (!selected || ngn <= fee) return 0;
    return (ngn - fee) / selected.ngn;
  }, [selected, ngn, fee]);

  const wallet = account?.address || destAddress;
  const canSubmit = ngn >= MIN_NGN && cryptoOut > 0 && /^0x[a-fA-F0-9]{40}$/.test(wallet);

  const handleBuy = async () => {
    if (!canSubmit || !selected) return;
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/exchange/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          side: "buy",
          coin: selected.symbol,
          coinName: selected.name,
          amountCrypto: cryptoOut,
          amountNgn: ngn,
          rate: selected.ngn,
          feeNgn: fee,
          walletAddress: wallet,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not create order");
      router.push(`/exchange/order/${data.order.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Try again.");
      setLoading(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col items-center py-8 sm:py-12 px-4 sm:px-6 w-full max-w-lg mx-auto z-10">
      <Link
        href="/exchange"
        className="anim-fade-up self-start flex items-center gap-2 text-zinc-500 hover:text-zinc-900 dark:hover:text-white transition-colors mb-6 group text-sm"
      >
        <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
        Exchange
      </Link>

      <div className="anim-fade-up anim-delay-1 w-full bg-zinc-50 dark:bg-zinc-900/40 border border-zinc-200 dark:border-zinc-800 rounded-[2rem] p-5 sm:p-8 backdrop-blur-xl shadow-2xl">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 bg-zinc-100 dark:bg-white/10 rounded-xl flex items-center justify-center">
            <ArrowDownToLine className="w-5 h-5 text-zinc-900 dark:text-white" />
          </div>
          <h1 className="text-2xl sm:text-3xl font-black text-zinc-900 dark:text-white tracking-tight">Buy Crypto</h1>
        </div>
        <p className="text-sm text-zinc-500 dark:text-zinc-400 mb-7 font-medium">
          Pay Naira from your bank. Crypto lands in your wallet.
        </p>

        {/* Coin selector */}
        <div className="flex gap-2 mb-6 overflow-x-auto no-scrollbar pb-1 -mx-1 px-1">
          {(coins.length ? coins : [{ symbol: "MON", name: "Monad", ngn: 0 }]).map((c) => (
            <button
              key={c.symbol}
              onClick={() => setCoin(c.symbol)}
              className={`px-4 py-2 rounded-full text-xs font-black uppercase tracking-wider whitespace-nowrap transition-all duration-300 border ${
                coin === c.symbol
                  ? "bg-zinc-900 dark:bg-white text-white dark:text-black border-zinc-900 dark:border-white shadow-lg scale-105"
                  : "bg-white dark:bg-zinc-900 text-zinc-500 dark:text-zinc-400 border-zinc-200 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700"
              }`}
            >
              {c.symbol}
              {c.symbol === "MON" && <span className="ml-1.5 text-[9px] opacity-80">★</span>}
            </button>
          ))}
        </div>

        {/* You pay */}
        <div className="rounded-3xl bg-white dark:bg-black/50 border border-zinc-200 dark:border-zinc-800 p-4 sm:p-5 mb-2 focus-within:border-zinc-500 dark:focus-within:border-zinc-400 transition-colors duration-300">
          <p className="text-[10px] font-black uppercase tracking-widest text-zinc-400 mb-1.5">You pay</p>
          <div className="flex items-center gap-3">
            <span className="text-2xl font-black text-zinc-400 dark:text-zinc-600">₦</span>
            <input
              type="number"
              inputMode="decimal"
              min={MIN_NGN}
              placeholder="10,000"
              value={ngnInput}
              onChange={(e) => setNgnInput(e.target.value)}
              className="flex-1 bg-transparent text-3xl font-black text-zinc-900 dark:text-white focus:outline-none placeholder:text-zinc-300 dark:placeholder:text-zinc-700 min-w-0"
            />
            <span className="text-xs font-black uppercase tracking-widest text-zinc-400 shrink-0">NGN</span>
          </div>
          <div className="flex gap-2 mt-3">
            {[5000, 20000, 100000].map((v) => (
              <button
                key={v}
                onClick={() => setNgnInput(String(v))}
                className="px-3 py-1.5 rounded-full bg-zinc-100 dark:bg-zinc-800 text-[11px] font-bold text-zinc-600 dark:text-zinc-300 hover:bg-zinc-900 dark:hover:bg-white hover:text-white dark:hover:text-black transition-colors duration-300"
              >
                ₦{v.toLocaleString()}
              </button>
            ))}
          </div>
        </div>

        {/* You receive */}
        <div className="rounded-3xl bg-white dark:bg-black/50 border border-zinc-200 dark:border-zinc-800 p-4 sm:p-5 mb-5 relative overflow-hidden">
          {ngn > 0 && <div className="absolute inset-0 anim-shimmer pointer-events-none" />}
          <p className="text-[10px] font-black uppercase tracking-widest text-zinc-400 mb-1.5">You receive</p>
          <div className="flex items-end justify-between gap-3">
            <p className="text-3xl font-black text-zinc-900 dark:text-white transition-all duration-500 truncate">
              {cryptoOut > 0
                ? cryptoOut.toLocaleString("en-US", { maximumFractionDigits: cryptoOut < 1 ? 6 : 4 })
                : "0.00"}
            </p>
            <span className="text-xs font-black uppercase tracking-widest text-zinc-900 dark:text-white shrink-0 mb-1.5">{coin}</span>
          </div>
          {selected && ngn > 0 && (
            <p className="text-[11px] text-zinc-400 mt-2 font-medium">
              Rate ₦{selected.ngn.toLocaleString("en-NG", { maximumFractionDigits: 2 })}/{coin} · Fee ₦
              {fee.toLocaleString("en-NG", { maximumFractionDigits: 0 })}
            </p>
          )}
        </div>

        {/* Destination wallet */}
        {account ? (
          <div className="flex items-center gap-2.5 px-4 py-3 rounded-2xl bg-zinc-100 dark:bg-zinc-800/60 border border-zinc-300 dark:border-zinc-600 mb-5">
            <Wallet className="w-4 h-4 text-zinc-900 dark:text-white shrink-0" />
            <p className="text-xs text-zinc-800 dark:text-zinc-200 font-bold truncate">
              Delivers to {account.address.slice(0, 8)}…{account.address.slice(-6)}
            </p>
          </div>
        ) : (
          <div className="mb-5">
            <p className="text-[10px] font-black uppercase tracking-widest text-zinc-400 mb-1.5 ml-1">
              Wallet address to receive {coin}
            </p>
            <input
              type="text"
              placeholder="0x…  (or connect your wallet above)"
              value={destAddress}
              onChange={(e) => setDestAddress(e.target.value.trim())}
              className="w-full bg-white dark:bg-black/50 border border-zinc-200 dark:border-zinc-800 rounded-2xl px-4 py-3.5 text-zinc-900 dark:text-white focus:outline-none focus:border-zinc-500 dark:focus:border-zinc-400 transition-all placeholder:text-zinc-400 dark:placeholder:text-zinc-700 font-mono text-xs"
            />
          </div>
        )}

        {error && (
          <div className="p-3.5 mb-4 rounded-2xl bg-zinc-100 dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 text-zinc-900 dark:text-white text-sm font-medium anim-fade-up">
            ⚠️ {error}
          </div>
        )}

        {/* The one button */}
        <button
          onClick={handleBuy}
          disabled={!canSubmit || loading}
          className="w-full py-5 rounded-2xl bg-zinc-900 dark:bg-white text-white dark:text-black font-black uppercase tracking-widest text-sm hover:scale-[1.02] active:scale-[0.97] transition-all duration-300 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:scale-100 shadow-xl flex items-center justify-center gap-2.5"
        >
          {loading ? (
            <><Loader2 className="w-5 h-5 animate-spin" /> Creating order…</>
          ) : (
            <>Buy {coin} now</>
          )}
        </button>

        <p className="mt-5 text-center text-[10px] text-zinc-400 uppercase tracking-widest font-bold">
          Minimum ₦{MIN_NGN.toLocaleString()} · Powered by VeriPay
        </p>
      </div>
    </div>
  );
}
