"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActiveAccount } from "thirdweb/react";
import { ArrowLeft, ArrowUpFromLine, Loader2, Landmark } from "lucide-react";
import { usePolling } from "@/lib/usePolling";

type Coin = { symbol: string; name: string; ngn: number; buyNgn: number; sellNgn: number };
type Rates = { coins: Coin[]; spreadPercent: number; minNgn: number; at: number };

const MIN_MON = 0.01;

const NIGERIAN_BANKS = [
  "Access Bank", "Fidelity Bank", "First Bank", "GTBank", "Kuda", "Moniepoint",
  "Opay", "Palmpay", "Stanbic IBTC", "Sterling Bank", "UBA", "Union Bank",
  "Wema Bank", "Zenith Bank", "Other",
];

export default function SellPage() {
  const router = useRouter();
  const account = useActiveAccount();

  const [rates, setRates] = useState<Rates | null>(null);
  const [monInput, setMonInput] = useState("");
  const [bankName, setBankName] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [accountName, setAccountName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [tick, setTick] = useState(0);

  const loadRates = useCallback(async () => {
    try {
      const res = await fetch("/api/exchange/rates");
      if (res.ok) setRates(await res.json());
    } catch { /* keep last good snapshot */ }
  }, []);

  usePolling(loadRates, 10_000);

  // See buy page: 5s cadence, paused in the background.
  useEffect(() => {
    let t: ReturnType<typeof setInterval> | undefined;
    const start = () => { t ??= setInterval(() => setTick((n) => n + 1), 5000); };
    const stop = () => { if (t) { clearInterval(t); t = undefined; } };
    const onVisibility = () => (document.visibilityState === "visible" ? start() : stop());

    if (document.visibilityState === "visible") start();
    document.addEventListener("visibilitychange", onVisibility);
    return () => { stop(); document.removeEventListener("visibilitychange", onVisibility); };
  }, []);

  const mon = rates?.coins.find((c) => c.symbol === "MON");
  const amount = parseFloat(monInput) || 0;
  const payout = useMemo(() => (mon ? amount * mon.sellNgn : 0), [mon, amount]);
  const secondsAgo = rates ? Math.max(0, Math.round((Date.now() - rates.at) / 1000)) : 0;
  void tick;

  const canSubmit =
    !!account &&
    amount >= MIN_MON &&
    payout > 0 &&
    bankName.trim().length > 1 &&
    /^\d{10}$/.test(accountNumber) &&
    accountName.trim().length > 2;

  const handleSell = async () => {
    if (!canSubmit || !account) return;
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/exchange/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          side: "sell",
          coin: "MON",
          amountCrypto: amount,
          walletAddress: account.address,
          bank: { bankName, accountNumber, accountName },
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

      <div className="anim-fade-up anim-delay-1 w-full bg-zinc-50 dark:bg-zinc-900/40 border border-zinc-200 dark:border-zinc-800 rounded-[2rem] p-5 sm:p-8 shadow-2xl">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 bg-zinc-100 dark:bg-white/10 rounded-xl flex items-center justify-center">
            <ArrowUpFromLine className="w-5 h-5 text-zinc-900 dark:text-white" />
          </div>
          <h1 className="text-2xl sm:text-3xl font-black text-zinc-900 dark:text-white tracking-tight">Sell MON</h1>
        </div>
        <p className="text-sm text-zinc-500 dark:text-zinc-400 mb-6 font-medium">
          Send MON from your wallet. Naira lands in your bank account.
        </p>

        {/* Live rate strip */}
        <div className="flex items-center justify-between gap-3 mb-6 px-4 py-2.5 rounded-2xl bg-white dark:bg-black/50 border border-zinc-200 dark:border-zinc-800">
          <div className="flex items-center gap-2 min-w-0">
            <span className="relative flex h-2 w-2 shrink-0">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-zinc-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-zinc-900 dark:bg-white" />
            </span>
            <span className="text-xs font-bold text-zinc-900 dark:text-white truncate">
              {mon ? `1 MON = ₦${mon.sellNgn.toLocaleString("en-NG", { maximumFractionDigits: 2 })}` : "Fetching live price…"}
            </span>
          </div>
          <span className="text-[10px] font-black uppercase tracking-widest text-zinc-400 shrink-0">
            {rates ? (secondsAgo < 2 ? "Just now" : `${secondsAgo}s ago`) : "—"}
          </span>
        </div>

        {/* You sell */}
        <div className="rounded-3xl bg-white dark:bg-black/50 border border-zinc-200 dark:border-zinc-800 p-4 sm:p-5 mb-2 focus-within:border-zinc-500 dark:focus-within:border-zinc-400 transition-colors duration-300">
          <p className="text-[10px] font-black uppercase tracking-widest text-zinc-400 mb-1.5">You sell</p>
          <div className="flex items-center gap-3">
            <input
              type="number"
              inputMode="decimal"
              min={MIN_MON}
              step="0.0001"
              placeholder="10.0"
              value={monInput}
              onChange={(e) => setMonInput(e.target.value)}
              className="flex-1 bg-transparent text-3xl font-black text-zinc-900 dark:text-white focus:outline-none placeholder:text-zinc-300 dark:placeholder:text-zinc-700 min-w-0"
            />
            <span className="text-xs font-black uppercase tracking-widest text-zinc-900 dark:text-white shrink-0">MON</span>
          </div>
        </div>

        {/* You receive */}
        <div className="rounded-3xl bg-white dark:bg-black/50 border border-zinc-200 dark:border-zinc-800 p-4 sm:p-5 mb-6 relative overflow-hidden">
          {amount > 0 && <div className="absolute inset-0 anim-shimmer pointer-events-none" />}
          <p className="text-[10px] font-black uppercase tracking-widest text-zinc-400 mb-1.5">You receive</p>
          <div className="flex items-end justify-between gap-3">
            <p className="text-3xl font-black text-zinc-900 dark:text-white truncate">
              ₦{payout > 0 ? payout.toLocaleString("en-NG", { maximumFractionDigits: 2 }) : "0"}
            </p>
            <span className="text-xs font-black uppercase tracking-widest text-zinc-400 shrink-0 mb-1.5">NGN</span>
          </div>
          {mon && amount > 0 && (
            <p className="text-[11px] text-zinc-400 mt-2 font-medium">
              Rate ₦{mon.sellNgn.toLocaleString("en-NG", { maximumFractionDigits: 2 })}/MON · incl. {rates?.spreadPercent}% spread
            </p>
          )}
        </div>

        {/* Bank details */}
        <div className="rounded-3xl bg-white dark:bg-black/50 border border-zinc-200 dark:border-zinc-800 p-4 sm:p-5 mb-5">
          <div className="flex items-center gap-2 mb-4">
            <Landmark className="w-4 h-4 text-zinc-900 dark:text-white" />
            <p className="text-[10px] font-black uppercase tracking-widest text-zinc-400">Your bank account</p>
          </div>
          <div className="flex flex-col gap-3">
            <select
              value={bankName}
              onChange={(e) => setBankName(e.target.value)}
              className="w-full bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl px-4 py-3.5 text-sm text-zinc-900 dark:text-white focus:outline-none focus:border-zinc-500 dark:focus:border-zinc-400 transition-all appearance-none"
            >
              <option value="">Select your bank…</option>
              {NIGERIAN_BANKS.map((b) => (
                <option key={b} value={b}>{b}</option>
              ))}
            </select>
            <input
              type="text"
              inputMode="numeric"
              maxLength={10}
              placeholder="Account number (10 digits)"
              value={accountNumber}
              onChange={(e) => setAccountNumber(e.target.value.replace(/\D/g, ""))}
              className="w-full bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl px-4 py-3.5 text-sm text-zinc-900 dark:text-white focus:outline-none focus:border-zinc-500 dark:focus:border-zinc-400 transition-all placeholder:text-zinc-400 dark:placeholder:text-zinc-600"
            />
            <input
              type="text"
              placeholder="Account name"
              value={accountName}
              onChange={(e) => setAccountName(e.target.value)}
              className="w-full bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl px-4 py-3.5 text-sm text-zinc-900 dark:text-white focus:outline-none focus:border-zinc-500 dark:focus:border-zinc-400 transition-all placeholder:text-zinc-400 dark:placeholder:text-zinc-600"
            />
          </div>
        </div>

        {!account && (
          <div className="p-3.5 mb-4 rounded-2xl bg-zinc-100 dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 text-zinc-900 dark:text-white text-sm font-medium">
            Connect your wallet (top right) to sell MON.
          </div>
        )}

        {error && (
          <div className="p-3.5 mb-4 rounded-2xl bg-zinc-100 dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 text-zinc-900 dark:text-white text-sm font-medium anim-fade-up">
            ⚠️ {error}
          </div>
        )}

        <button
          onClick={handleSell}
          disabled={!canSubmit || loading}
          className="w-full py-5 rounded-2xl bg-zinc-900 dark:bg-white text-white dark:text-black font-black uppercase tracking-widest text-sm hover:scale-[1.02] active:scale-[0.97] transition-all duration-300 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:scale-100 shadow-xl flex items-center justify-center gap-2.5"
        >
          {loading ? (
            <><Loader2 className="w-5 h-5 animate-spin" /> Locking your rate…</>
          ) : (
            <>Sell MON now</>
          )}
        </button>

        <p className="mt-5 text-center text-[10px] text-zinc-400 uppercase tracking-widest font-bold">
          Minimum {MIN_MON} MON · Rate locked for 15 min at checkout
        </p>
      </div>
    </div>
  );
}
