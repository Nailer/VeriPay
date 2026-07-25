"use client";

import { useState } from "react";
import {
  Copy, Check, Loader2, ShieldCheck, ExternalLink, ChevronDown,
  Landmark, CreditCard, AlertTriangle, TrendingDown, TrendingUp,
} from "lucide-react";

export type AdminOrder = {
  id: string;
  side: "buy" | "sell";
  paymentMethod: "transfer" | "card";
  coin: string;
  amountCrypto: number;
  amountNgn: number;
  exactAmountNgn: number;
  rate: number;
  spreadPercent: number;
  feeNgn: number;
  walletAddress: string;
  bank?: { bankName: string; accountNumber: string; accountName: string };
  status: string;
  createdAt: number;
  paidAt?: number;
  payerName?: string;
  payerNote?: string;
  txHash?: string;
  payoutTxHash?: string;
  paystackRef?: string;
  payoutRef?: string;
  adminNote?: string;
  rejectionReason?: string;
  settlementRef: string;
  rateDriftPercent?: number | null;
};

const STATUS_STYLES: Record<string, string> = {
  awaiting_payment: "bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 border border-zinc-300 dark:border-zinc-600",
  payment_review: "bg-zinc-900 dark:bg-white text-white dark:text-black",
  verified: "bg-zinc-900 dark:bg-white text-white dark:text-black",
  completed: "bg-zinc-200 dark:bg-zinc-700 text-zinc-900 dark:text-white",
  rejected: "bg-zinc-100 dark:bg-zinc-800 text-zinc-500 line-through",
  expired: "bg-zinc-100 dark:bg-zinc-800 text-zinc-500",
  cancelled: "bg-zinc-100 dark:bg-zinc-800 text-zinc-500",
};

const ngn = (n: number, dp = 2) =>
  `₦${n.toLocaleString("en-NG", { minimumFractionDigits: dp, maximumFractionDigits: dp })}`;

function CopyRow({
  label, value, mono = false, big = false,
}: { label: string; value: string; mono?: boolean; big?: boolean }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0 flex-1">
        <p className="text-[9px] font-black uppercase tracking-widest text-zinc-400">{label}</p>
        <p className={`text-zinc-900 dark:text-white break-all ${mono ? "font-mono" : ""} ${
          big ? "text-lg font-black" : "text-sm font-bold"
        }`}>
          {value}
        </p>
      </div>
      <button
        onClick={() => {
          navigator.clipboard.writeText(value).catch(() => {});
          setCopied(true);
          setTimeout(() => setCopied(false), 1800);
        }}
        className={`p-2 rounded-lg border shrink-0 transition-all ${
          copied
            ? "bg-zinc-900 dark:bg-white border-zinc-900 dark:border-white text-white dark:text-black"
            : "bg-zinc-50 dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 text-zinc-500 hover:text-zinc-900 dark:hover:text-white"
        }`}
        aria-label={`Copy ${label}`}
      >
        {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
      </button>
    </div>
  );
}

export default function AdminOrderCard({
  order, hotWallet, onAction,
}: {
  order: AdminOrder;
  hotWallet: boolean;
  onAction: (action: string, extra?: Record<string, unknown>) => Promise<void>;
}) {
  const [expanded, setExpanded] = useState(false);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  const [payoutRef, setPayoutRef] = useState("");
  const [manualTx, setManualTx] = useState("");

  const isBuy = order.side === "buy";
  const needsAction =
    (isBuy && (order.status === "payment_review" || order.status === "verified")) ||
    (!isBuy && order.status === "verified");

  const run = async (action: string, extra?: Record<string, unknown>) => {
    setBusy(action);
    setError("");
    try {
      await onAction(action, extra);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Action failed");
    } finally {
      setBusy("");
    }
  };

  const drift = order.rateDriftPercent;
  const driftBad = typeof drift === "number" && (isBuy ? drift > 1 : drift < -1);

  return (
    <div className={`rounded-2xl border transition-all duration-300 ${
      needsAction
        ? "bg-white dark:bg-zinc-900/70 border-zinc-900 dark:border-white shadow-lg"
        : "bg-white dark:bg-zinc-900/50 border-zinc-200 dark:border-zinc-800"
    }`}>
      {/* Header */}
      <button onClick={() => setExpanded((v) => !v)} className="w-full text-left p-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2 min-w-0">
            <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-widest shrink-0 ${
              isBuy
                ? "bg-zinc-900 dark:bg-white text-white dark:text-black"
                : "bg-zinc-200 dark:bg-zinc-700 text-zinc-900 dark:text-white"
            }`}>
              {order.side}
            </span>
            {order.paymentMethod === "card" && (
              <CreditCard className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
            )}
            <span className="text-sm font-black text-zinc-900 dark:text-white">{order.id}</span>
            <span className="text-xs font-bold text-zinc-500 truncate">
              {order.amountCrypto.toLocaleString("en-US", { maximumFractionDigits: 6 })} {order.coin}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className={`px-2.5 py-1 rounded-full text-[9px] font-black uppercase tracking-widest ${STATUS_STYLES[order.status] ?? ""}`}>
              {order.status.replace(/_/g, " ")}
            </span>
            <ChevronDown className={`w-4 h-4 text-zinc-400 transition-transform duration-300 ${expanded ? "rotate-180" : ""}`} />
          </div>
        </div>

        <div className="flex items-center justify-between gap-3 mt-2 flex-wrap">
          <p className="text-xs font-bold text-zinc-700 dark:text-zinc-300">
            {isBuy ? `Collect ${ngn(order.exactAmountNgn)}` : `Pay out ${ngn(order.amountNgn)}`}
          </p>
          <p className="text-[10px] text-zinc-400 font-medium">
            {new Date(order.createdAt).toLocaleString()}
          </p>
        </div>

        {needsAction && (
          <p className="mt-2 text-[10px] font-black uppercase tracking-widest text-zinc-900 dark:text-white">
            ● Needs your action
          </p>
        )}
      </button>

      {/* Body */}
      {expanded && (
        <div className="px-4 pb-4 space-y-4 anim-fade-up">
          {/* What to check */}
          <div className="rounded-xl bg-zinc-50 dark:bg-black/40 border border-zinc-200 dark:border-zinc-800 p-4 space-y-3">
            <p className="text-[9px] font-black uppercase tracking-widest text-zinc-400 flex items-center gap-1.5">
              {isBuy ? <><Landmark className="w-3 h-3" /> Money you should have received</> : <><ShieldCheck className="w-3 h-3" /> Crypto we received</>}
            </p>

            {isBuy ? (
              <>
                <CopyRow label="Exact amount to look for" value={order.exactAmountNgn.toFixed(2)} big />
                <CopyRow label="Reference / narration" value={order.settlementRef} mono />
                {order.payerName && <CopyRow label="Customer says they paid from" value={order.payerName} />}
                {order.paystackRef && <CopyRow label="Paystack reference" value={order.paystackRef} mono />}
                {order.payerNote && (
                  <div>
                    <p className="text-[9px] font-black uppercase tracking-widest text-zinc-400">Customer note</p>
                    <p className="text-sm text-zinc-700 dark:text-zinc-300">{order.payerNote}</p>
                  </div>
                )}
              </>
            ) : (
              <>
                <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-zinc-900 dark:bg-white text-white dark:text-black">
                  <ShieldCheck className="w-4 h-4 shrink-0" />
                  <p className="text-[10px] font-black uppercase tracking-wide">
                    {order.txHash ? "Deposit proven on-chain — no manual check needed" : "Awaiting deposit"}
                  </p>
                </div>
                {order.txHash && (
                  <>
                    <CopyRow label="Deposit transaction" value={order.txHash} mono />
                    <a href={`https://monad-testnet.socialscan.io/tx/${order.txHash}`} target="_blank" rel="noreferrer"
                      className="inline-flex items-center gap-1.5 text-[11px] font-bold text-zinc-900 dark:text-white underline underline-offset-2">
                      Open in explorer <ExternalLink className="w-3 h-3" />
                    </a>
                  </>
                )}
              </>
            )}
          </div>

          {/* What to send */}
          <div className="rounded-xl bg-zinc-50 dark:bg-black/40 border border-zinc-200 dark:border-zinc-800 p-4 space-y-3">
            <p className="text-[9px] font-black uppercase tracking-widest text-zinc-400">
              {isBuy ? "What you must send" : "Where to send the Naira"}
            </p>

            {isBuy ? (
              <>
                <CopyRow label={`Amount of ${order.coin}`} value={String(order.amountCrypto)} big mono />
                <CopyRow label="To wallet address" value={order.walletAddress} mono />
              </>
            ) : (
              <>
                <CopyRow label="Amount" value={order.amountNgn.toFixed(2)} big />
                <CopyRow label="Account number" value={order.bank?.accountNumber || "—"} mono big />
                <CopyRow label="Account name" value={order.bank?.accountName || "—"} />
                <CopyRow label="Bank" value={order.bank?.bankName || "—"} />
              </>
            )}
          </div>

          {/* Margin */}
          <div className="flex items-center justify-between gap-3 px-4 py-3 rounded-xl bg-zinc-50 dark:bg-black/40 border border-zinc-200 dark:border-zinc-800">
            <div>
              <p className="text-[9px] font-black uppercase tracking-widest text-zinc-400">Locked rate · your margin</p>
              <p className="text-sm font-bold text-zinc-900 dark:text-white">
                ₦{order.rate.toLocaleString("en-NG", { maximumFractionDigits: 2 })} · {ngn(order.feeNgn, 0)} ({order.spreadPercent}%)
              </p>
            </div>
            {typeof drift === "number" && (
              <div className={`flex items-center gap-1 text-xs font-black shrink-0 ${
                driftBad ? "text-zinc-900 dark:text-white" : "text-zinc-400"
              }`}>
                {drift >= 0 ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
                {drift >= 0 ? "+" : ""}{drift.toFixed(2)}%
              </div>
            )}
          </div>

          {driftBad && (
            <div className="flex items-start gap-2 px-4 py-3 rounded-xl bg-zinc-900 dark:bg-white text-white dark:text-black">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <p className="text-[11px] font-bold leading-relaxed">
                The market has moved {Math.abs(drift!).toFixed(2)}% against this locked rate. Settling it now costs you
                more than the spread earns — check before releasing.
              </p>
            </div>
          )}

          {order.adminNote && (
            <p className="text-[11px] text-zinc-500 dark:text-zinc-400 italic">Note: {order.adminNote}</p>
          )}
          {order.rejectionReason && (
            <p className="text-[11px] text-zinc-500 dark:text-zinc-400 italic">Rejected: {order.rejectionReason}</p>
          )}
          {order.payoutTxHash && <CopyRow label="Payout transaction" value={order.payoutTxHash} mono />}
          {order.payoutRef && <CopyRow label="Payout reference" value={order.payoutRef} />}

          {error && (
            <div className="p-3 rounded-xl bg-zinc-100 dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-600 text-xs font-bold text-zinc-900 dark:text-white">
              {error}
            </div>
          )}

          {/* Actions */}
          {needsAction && !rejecting && (
            <div className="space-y-2.5">
              {isBuy ? (
                <>
                  {!hotWallet && order.status === "verified" && (
                    <input
                      type="text" value={manualTx} onChange={(e) => setManualTx(e.target.value)}
                      placeholder="Paste the payout transaction hash (0x…)"
                      className="w-full bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl px-4 py-3 text-xs font-mono text-zinc-900 dark:text-white focus:outline-none focus:border-zinc-500"
                    />
                  )}
                  <button
                    onClick={() =>
                      order.status === "verified" && !hotWallet
                        ? run("record_payout_tx", { txHash: manualTx.trim() })
                        : run("confirm_payment")
                    }
                    disabled={!!busy}
                    className="w-full py-4 rounded-xl bg-zinc-900 dark:bg-white text-white dark:text-black font-black uppercase tracking-widest text-xs disabled:opacity-50 hover:scale-[1.01] active:scale-[0.98] transition-all flex items-center justify-center gap-2"
                  >
                    {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                    {order.status === "verified" && !hotWallet
                      ? "Record payout & complete"
                      : hotWallet
                        ? `Confirm payment & send ${order.coin}`
                        : "Confirm payment received"}
                  </button>
                </>
              ) : (
                <>
                  <input
                    type="text" value={payoutRef} onChange={(e) => setPayoutRef(e.target.value)}
                    placeholder="Your bank transfer reference"
                    className="w-full bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl px-4 py-3 text-xs text-zinc-900 dark:text-white focus:outline-none focus:border-zinc-500"
                  />
                  <button
                    onClick={() => run("mark_paid_out", { payoutRef: payoutRef.trim() })}
                    disabled={!!busy || payoutRef.trim().length < 3}
                    className="w-full py-4 rounded-xl bg-zinc-900 dark:bg-white text-white dark:text-black font-black uppercase tracking-widest text-xs disabled:opacity-50 hover:scale-[1.01] active:scale-[0.98] transition-all flex items-center justify-center gap-2"
                  >
                    {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                    I&apos;ve sent the Naira
                  </button>
                </>
              )}
              <button
                onClick={() => setRejecting(true)} disabled={!!busy}
                className="w-full py-2 text-[10px] font-black uppercase tracking-widest text-zinc-400 hover:text-zinc-900 dark:hover:text-white underline underline-offset-2 transition-colors"
              >
                Reject this order
              </button>
            </div>
          )}

          {rejecting && (
            <div className="space-y-2.5 anim-fade-up">
              <input
                type="text" value={reason} onChange={(e) => setReason(e.target.value)}
                placeholder="Reason — the customer sees this" autoFocus
                className="w-full bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl px-4 py-3 text-xs text-zinc-900 dark:text-white focus:outline-none focus:border-zinc-500"
              />
              <div className="flex gap-2">
                <button
                  onClick={() => run("reject", { reason: reason.trim() }).then(() => setRejecting(false))}
                  disabled={!!busy || reason.trim().length < 3}
                  className="flex-1 py-3 rounded-xl bg-zinc-900 dark:bg-white text-white dark:text-black font-black uppercase tracking-widest text-[10px] disabled:opacity-50"
                >
                  Confirm reject
                </button>
                <button
                  onClick={() => setRejecting(false)} disabled={!!busy}
                  className="flex-1 py-3 rounded-xl bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 font-black uppercase tracking-widest text-[10px]"
                >
                  Back
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
