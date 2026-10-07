"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { useActiveAccount } from "thirdweb/react";
import { prepareContractCall, sendTransaction, waitForReceipt } from "thirdweb";
import { createPublicClient, http, parseUnits, formatEther, toEventSelector } from "viem";
import { Loader2, ShieldCheck, Fingerprint, CheckCircle2, Zap, ArrowUpRight } from "lucide-react";
import {
  escrowContract, ngnContract, friendlyTxError, MONAD_RPC_URL,
  NGN_TOKEN_ADDRESS, NGN_TOKEN_DECIMALS, erc20Abi,
} from "@/lib/monad";
import { CONTRACT_ADDRESS } from "@/lib/abi";
import { useSignIn } from "@/lib/useSignIn";
import SellerReputationCard from "@/components/SellerReputationCard";

declare global {
  interface Window {
    PaystackPop?: { setup(opts: Record<string, unknown>): { openIframe(): void } };
  }
}

type Seller = { handle: string; name: string; address: string };
type Step = "form" | "paying" | "confirming" | "locking" | "done";
type Done = { tradeId: string; seconds: number; feeNgn: number | null; txHash: string; at: Date };

const TRADE_CREATED = toEventSelector("TradeCreated(uint256,address,address,uint256)");
const testCard = (process.env.NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY || "").startsWith("pk_test");
const naira = (n: number) => `₦${n.toLocaleString("en-NG", { maximumFractionDigits: 2 })}`;
const input = "w-full bg-white dark:bg-black/50 border border-zinc-200 dark:border-zinc-800 rounded-2xl px-4 py-4 text-zinc-900 dark:text-white focus:outline-none focus:border-zinc-500 placeholder:text-zinc-400 dark:placeholder:text-zinc-700";
const label = "text-xs font-black uppercase tracking-widest text-zinc-500 ml-1";

export default function PayLink() {
  const { handle } = useParams<{ handle: string }>();
  const account = useActiveAccount();
  const signIn = useSignIn();

  const [seller, setSeller] = useState<Seller | null | undefined>(undefined);
  const [amount, setAmount] = useState("");
  const [item, setItem] = useState("");
  const [email, setEmail] = useState("");
  const [step, setStep] = useState<Step>("form");
  const [error, setError] = useState("");
  const [funded, setFunded] = useState(false); // card charged + money in account, escrow not yet locked
  const [done, setDone] = useState<Done | null>(null);
  const [payRef, setPayRef] = useState(""); // our reference for this payment, shown on the receipt

  useEffect(() => {
    fetch(`/api/sellers?handle=${encodeURIComponent(handle)}`)
      .then((r) => r.json()).then((d) => setSeller(d.seller ?? null)).catch(() => setSeller(null));
    if (!window.PaystackPop) {
      const s = document.createElement("script");
      s.src = "https://js.paystack.co/v1/inline.js";
      s.async = true;
      document.body.appendChild(s);
    }
  }, [handle]);

  const amountNgn = Number(amount);

  // Lock the money the buyer now holds into escrow for this seller.
  const lock = useCallback(async () => {
    if (!account || !seller) return;
    setStep("locking"); setError("");
    try {
      const units = parseUnits(amountNgn.toFixed(2), NGN_TOKEN_DECIMALS);
      const pub = createPublicClient({ transport: http(MONAD_RPC_URL) });

      const allowance = (await pub.readContract({
        address: NGN_TOKEN_ADDRESS, abi: erc20Abi, functionName: "allowance",
        args: [account.address as `0x${string}`, CONTRACT_ADDRESS],
      })) as bigint;
      if (allowance < units) {
        const approve = prepareContractCall({ contract: ngnContract, method: "approve", params: [CONTRACT_ADDRESS, units] });
        await waitForReceipt(await sendTransaction({ account, transaction: approve }));
      }

      const tx = prepareContractCall({
        contract: escrowContract, method: "createTradeWithToken",
        params: [seller.address as `0x${string}`, item.trim(), NGN_TOKEN_ADDRESS, units],
      });
      const started = performance.now();
      const sent = await sendTransaction({ account, transaction: tx });
      const receipt = await waitForReceipt(sent);
      const seconds = (performance.now() - started) / 1000;
      if (receipt.status !== "success") throw new Error("The payment couldn't be locked. Tap retry.");

      const log = receipt.logs.find((l) => l.address.toLowerCase() === CONTRACT_ADDRESS.toLowerCase() && l.topics[0] === TRADE_CREATED);
      const tradeId = log?.topics[1] ? BigInt(log.topics[1]).toString() : "";

      // What this cost on the network, in naira — the number that makes
      // escrow on a ₦2,000 order make sense.
      let feeNgn: number | null = null;
      try {
        const rates = await fetch("/api/exchange/rates").then((r) => r.json());
        const mon = (rates.coins as { symbol: string; buyNgn: number }[]).find((c) => c.symbol === "MON");
        if (mon) feeNgn = Number(formatEther(receipt.gasUsed * receipt.effectiveGasPrice)) * mon.buyNgn;
      } catch { /* cosmetic */ }

      if (tradeId) {
        const body = { "Content-Type": "application/json" };
        fetch("/api/trades/log", {
          method: "POST", headers: body,
          body: JSON.stringify({
            tradeId, action: "created", actorAddress: account.address, txHash: sent.transactionHash,
            buyerAddress: account.address, sellerAddress: seller.address, amountWei: units.toString(), metadata: item.trim(),
          }),
        }).catch(() => {});
        fetch("/api/notifications", {
          method: "POST", headers: body,
          body: JSON.stringify({ toAddress: seller.address, type: "trade", tradeId, fromAddress: account.address, amount: naira(amountNgn) }),
        }).catch(() => {});
      }

      setDone({ tradeId, seconds, feeNgn, txHash: sent.transactionHash, at: new Date() });
      setStep("done");
    } catch (err) {
      setError(friendlyTxError(err));
      setStep("form");
    }
  }, [account, seller, amountNgn, item]);

  const pay = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!account || !seller) return;
    if (funded) return lock();
    setError(""); setStep("paying");

    try {
      const res = await fetch("/api/pay/intent", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ handle: seller.handle, amountNgn, item, buyerAddress: account.address, email }),
      });
      const init = await res.json();
      if (!res.ok) throw new Error(init.error || "Couldn't start the payment.");
      setPayRef(init.intent.id);

      const confirm = async (reference: string) => {
        setStep("confirming");
        const cr = await fetch("/api/pay/confirm", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: init.intent.id, reference }),
        });
        const cd = await cr.json();
        if (!cr.ok) throw new Error(cd.error || "We couldn't confirm that payment.");
        if (cd.intent.status !== "funded") throw new Error("Still finishing your payment — tap retry in a moment.");
        setFunded(true);
        await lock();
      };

      if (init.demo) return await confirm(init.reference);
      // A secret key without its public half can't open the card popup. Say so,
      // rather than confirming a charge that was never made.
      if (!init.publicKey) throw new Error("Card checkout isn't switched on for this site yet.");

      if (!window.PaystackPop) throw new Error("Card checkout is still loading — try again in a moment.");
      window.PaystackPop.setup({
        key: init.publicKey, email, amount: Math.round(amountNgn * 100), currency: "NGN", ref: init.reference,
        onClose: () => setStep((s) => (s === "paying" ? "form" : s)),
        callback: (response: { reference: string }) => {
          confirm(response.reference).catch((err) => { setError(err instanceof Error ? err.message : "Payment failed."); setStep("form"); });
        },
      }).openIframe();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Payment failed.");
      setStep("form");
    }
  };

  if (seller === undefined) {
    return <div className="flex-1 flex items-center justify-center"><Loader2 className="w-6 h-6 animate-spin text-zinc-500" /></div>;
  }
  if (seller === null) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-3 p-8 text-center">
        <p className="text-lg font-black text-zinc-900 dark:text-white">This payment link doesn&apos;t exist.</p>
        <p className="text-sm text-zinc-500">Check the link with your seller — a real VeriPay link always shows their trade record.</p>
      </div>
    );
  }

  const busy = step !== "form";
  const card = "w-full bg-zinc-50 dark:bg-zinc-900/40 border border-zinc-200 dark:border-zinc-800 rounded-[2rem] p-5 sm:p-8";

  if (step === "done" && done) {
    const row = "flex items-start justify-between gap-4 py-2.5";
    const key = "text-[11px] font-black uppercase tracking-widest text-zinc-500 shrink-0 pt-0.5";
    const val = "text-sm font-bold text-zinc-900 dark:text-white text-right break-words min-w-0";
    return (
      <div className="flex-1 flex flex-col items-center py-8 sm:py-14 px-4 w-full max-w-md mx-auto">
        <div className={`${card} anim-scale-in`}>
          <div className="text-center">
            <div className="w-14 h-14 rounded-full bg-zinc-900 dark:bg-white flex items-center justify-center mx-auto mb-4">
              <CheckCircle2 className="w-7 h-7 text-white dark:text-black" />
            </div>
            <p className="text-[11px] font-black uppercase tracking-widest text-zinc-500">Payment secured</p>
            <p className="text-4xl font-black text-zinc-900 dark:text-white mt-1">{naira(amountNgn)}</p>
            <p className="text-sm text-zinc-600 dark:text-zinc-400 mt-2 leading-relaxed">
              Held safely for you. {seller.name} only gets paid when you confirm your order arrived.
            </p>
          </div>

          <div className="my-5 border-t border-dashed border-zinc-300 dark:border-zinc-700" />

          <div className="divide-y divide-zinc-200 dark:divide-zinc-800">
            <div className={row}><span className={key}>Paid to</span><span className={val}>{seller.name}<span className="block text-xs font-medium text-zinc-500">@{seller.handle}</span></span></div>
            <div className={row}><span className={key}>For</span><span className={val}>{item.trim()}</span></div>
            {done.tradeId && <div className={row}><span className={key}>Order no.</span><span className={`${val} font-mono`}>#{done.tradeId.padStart(4, "0")}</span></div>}
            {payRef && <div className={row}><span className={key}>Reference</span><span className={`${val} font-mono`}>VP-{payRef}</span></div>}
            <div className={row}><span className={key}>Date</span><span className={val}>{done.at.toLocaleString("en-NG", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}</span></div>
            <div className={row}><span className={key}>Status</span><span className={val}>Held until you confirm delivery</span></div>
          </div>

          <div className="mt-4 flex items-center justify-center gap-2 px-3 py-2 rounded-full bg-zinc-100 dark:bg-zinc-800 text-[11px] font-bold text-zinc-600 dark:text-zinc-300">
            <Zap className="w-3.5 h-3.5 shrink-0" />
            Secured in {done.seconds.toFixed(1)}s{done.feeNgn !== null && ` · network fee ${naira(Math.max(done.feeNgn, 0.01))}, paid for you`}
          </div>

          <Link
            href={done.tradeId ? `/trade/${done.tradeId}` : "/dashboard"}
            className="mt-5 block w-full py-4 rounded-2xl bg-zinc-900 dark:bg-white text-white dark:text-black font-black uppercase tracking-widest text-sm text-center"
          >
            Track your order
          </Link>
          <a
            href={`https://testnet.monadscan.com/tx/${done.txHash}`} target="_blank" rel="noopener noreferrer"
            className="mt-2 flex items-center justify-center gap-1.5 w-full py-3 rounded-2xl border border-zinc-200 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300 font-bold text-sm"
          >
            View proof on Monad <ArrowUpRight className="w-4 h-4" />
          </a>

          <p className="mt-4 text-[11px] text-zinc-500 text-center">Test payment — no real money moved.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col items-center py-8 sm:py-14 px-4 w-full max-w-md mx-auto gap-4">
      <div className={card}>
        <div className="flex items-center gap-3 mb-4">
          <div className="w-11 h-11 rounded-2xl bg-zinc-900 dark:bg-white flex items-center justify-center text-white dark:text-black font-black text-lg">
            {seller.name.charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0">
            <h1 className="text-xl font-black text-zinc-900 dark:text-white truncate">{seller.name}</h1>
            <p className="text-xs text-zinc-500">@{seller.handle}</p>
          </div>
        </div>
        <SellerReputationCard address={seller.address} />
      </div>

      <div className={card}>
        <div className="flex items-start gap-3 mb-5">
          <ShieldCheck className="w-5 h-5 text-zinc-900 dark:text-white shrink-0 mt-0.5" />
          <p className="text-sm text-zinc-600 dark:text-zinc-400 leading-relaxed">
            Your money is held safely and only released to the seller when <span className="font-bold text-zinc-900 dark:text-white">you</span> confirm delivery.
          </p>
        </div>

        {error && <div className="p-4 mb-4 rounded-2xl bg-zinc-100 dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 text-sm text-zinc-900 dark:text-white">{error}</div>}

        <form onSubmit={pay} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <label className={label}>Amount (₦)</label>
            <input required type="number" inputMode="decimal" min="100" step="0.01" placeholder="25,000" disabled={busy || funded}
              value={amount} onChange={(e) => setAmount(e.target.value)} className={`${input} font-black text-2xl`} />
          </div>
          <div className="flex flex-col gap-2">
            <label className={label}>What are you buying?</label>
            <input required type="text" maxLength={140} placeholder="e.g. Black Ankara gown, size 12" disabled={busy || funded}
              value={item} onChange={(e) => setItem(e.target.value)} className={`${input} text-sm`} />
          </div>
          <div className="flex flex-col gap-2">
            <label className={label}>Email for your receipt</label>
            <input required type="email" placeholder="you@example.com" disabled={busy || funded}
              value={email} onChange={(e) => setEmail(e.target.value)} className={`${input} text-sm`} />
          </div>

          {account ? (
            <button type="submit" disabled={busy}
              className="mt-1 py-4 rounded-2xl bg-zinc-900 dark:bg-white text-white dark:text-black font-black uppercase tracking-widest text-sm disabled:opacity-60 flex items-center justify-center gap-2">
              {busy && <Loader2 className="w-4 h-4 animate-spin" />}
              {step === "paying" ? "Opening card payment…"
                : step === "confirming" ? "Confirming payment…"
                : step === "locking" ? "Securing your money…"
                : funded ? "Retry securing payment"
                : amountNgn > 0 ? `Pay ${naira(amountNgn)} safely` : "Pay safely"}
            </button>
          ) : (
            <div className="flex flex-col gap-2 mt-1">
              {signIn.passkeySupported && (
                <button type="button" onClick={signIn.withPasskey} disabled={signIn.busy}
                  className="py-4 rounded-2xl bg-zinc-900 dark:bg-white text-white dark:text-black font-black uppercase tracking-widest text-sm flex items-center justify-center gap-2 disabled:opacity-60">
                  {signIn.busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Fingerprint className="w-4 h-4 shrink-0" />}
                  Use Face ID / fingerprint
                </button>
              )}
              <button type="button" onClick={signIn.withOther}
                className="py-3.5 rounded-2xl border border-zinc-200 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300 font-bold text-sm">
                {signIn.passkeySupported ? "Other ways to sign in" : "Sign in to pay"}
              </button>
              {signIn.error && <p className="text-xs text-zinc-500 leading-relaxed">{signIn.error}</p>}
            </div>
          )}
        </form>

        <p className="mt-4 text-[11px] text-zinc-500 leading-relaxed">
          Test version — no real money moves.
          {testCard && <> Use card <span className="font-mono">4084 0840 8408 4081</span>, any future expiry, CVV <span className="font-mono">408</span>.</>}
        </p>
      </div>
    </div>
  );
}
