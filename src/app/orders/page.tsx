"use client";

import { useActiveAccount } from "thirdweb/react";
import { Fingerprint, Loader2 } from "lucide-react";
import { useSignIn } from "@/lib/useSignIn";
import OrdersList from "@/components/OrdersList";

const card = "w-full bg-zinc-50 dark:bg-zinc-900/40 border border-zinc-200 dark:border-zinc-800 rounded-[2rem] p-5 sm:p-8";
const heading = "text-xs font-black uppercase tracking-widest text-zinc-500 mb-2";

export default function Orders() {
  const account = useActiveAccount();
  const signIn = useSignIn();

  return (
    <div className="flex-1 flex flex-col items-center py-8 sm:py-14 px-4 w-full max-w-md mx-auto gap-4">
      {!account ? (
        <div className={card}>
          <h1 className="text-2xl sm:text-3xl font-black text-zinc-900 dark:text-white tracking-tight mb-2">Your orders</h1>
          <p className="text-sm text-zinc-600 dark:text-zinc-400 leading-relaxed mb-6">
            Sign in the same way you did when you paid, and everything you&apos;ve bought or sold shows up here.
          </p>
          <div className="flex flex-col gap-2">
            {signIn.passkeySupported && (
              <button onClick={signIn.withPasskey} disabled={signIn.busy}
                className="py-4 rounded-2xl bg-zinc-900 dark:bg-white text-white dark:text-black font-black uppercase tracking-widest text-sm flex items-center justify-center gap-2 disabled:opacity-60">
                {signIn.busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Fingerprint className="w-4 h-4 shrink-0" />}
                Use Face ID / fingerprint
              </button>
            )}
            <button onClick={signIn.withOther} className="py-3.5 rounded-2xl border border-zinc-200 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300 font-bold text-sm">
              {signIn.passkeySupported ? "Other ways to sign in" : "Sign in"}
            </button>
            {signIn.error && <p className="text-xs text-zinc-500 leading-relaxed">{signIn.error}</p>}
          </div>
        </div>
      ) : (
        <>
          <div className={card}>
            <h1 className="text-2xl sm:text-3xl font-black text-zinc-900 dark:text-white tracking-tight mb-5">Your orders</h1>
            <p className={heading}>Bought</p>
            <OrdersList address={account.address} role="buyer" empty="Nothing yet. When you pay a seller through their VeriPay link, it shows up here." />
          </div>
          <div className={card}>
            <p className={heading}>Sold</p>
            <OrdersList address={account.address} role="seller" empty="Nothing yet. Share your payment link and orders will appear here." />
          </div>
        </>
      )}
    </div>
  );
}
