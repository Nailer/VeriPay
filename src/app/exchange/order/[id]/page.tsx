"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useActiveAccount } from "thirdweb/react";
import { createWalletClient, createPublicClient, custom, http, parseEther } from "viem";
import {
  ArrowLeft, CheckCircle2, Copy, Check, Loader2, Landmark,
  MessageSquare, Send, ExternalLink, XCircle,
} from "lucide-react";

type Order = {
  id: string;
  side: "buy" | "sell";
  coin: string;
  coinName: string;
  amountCrypto: number;
  amountNgn: number;
  rate: number;
  feeNgn: number;
  walletAddress: string;
  bank?: { bankName: string; accountNumber: string; accountName: string };
  status: "awaiting_payment" | "confirming" | "completed" | "cancelled";
  createdAt: number;
  txHash?: string;
  payoutTxHash?: string;
  settlementRef: string;
};

type Bank = { bankName: string; accountNumber: string; accountName: string };

type ChatMessage = {
  id: number;
  sender: string;
  address: string;
  text: string;
  time: string;
  isAdmin: boolean;
};

const MONAD_CHAIN = {
  id: 10143,
  name: "Monad Testnet",
  nativeCurrency: { name: "MON", symbol: "MON", decimals: 18 },
  rpcUrls: {
    default: { http: ["https://testnet-rpc.monad.xyz"] },
    public: { http: ["https://testnet-rpc.monad.xyz"] },
  },
};

export default function OrderPage() {
  const params = useParams();
  const orderId = (params?.id as string)?.toUpperCase();
  const account = useActiveAccount();

  const [order, setOrder] = useState<Order | null>(null);
  const [merchantBank, setMerchantBank] = useState<Bank | null>(null);
  const [merchantAddress, setMerchantAddress] = useState("");
  const [notFound, setNotFound] = useState(false);
  const [acting, setActing] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  // ─── Chat state ─────────────────────────────────────────────────────────
  const [chatOpen, setChatOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const chatEndRef = useRef<HTMLDivElement>(null);
  const threadId = `ex-${orderId?.toLowerCase()}`;

  const fetchOrder = useCallback(async () => {
    if (!orderId) return;
    try {
      const res = await fetch(`/api/exchange/orders?id=${orderId}`);
      if (res.status === 404) { setNotFound(true); return; }
      if (res.ok) {
        const data = await res.json();
        setOrder(data.order);
        setMerchantBank(data.merchantBank);
        setMerchantAddress(data.merchantAddress);
      }
    } catch { /* silent */ }
  }, [orderId]);

  const fetchChat = useCallback(async () => {
    if (!orderId) return;
    try {
      const res = await fetch(`/api/chat?tradeId=${threadId}`);
      if (res.ok) {
        const data = await res.json();
        setMessages(data.messages ?? []);
      }
    } catch { /* silent */ }
  }, [orderId, threadId]);

  useEffect(() => {
    fetchOrder();
    const interval = setInterval(fetchOrder, 4000);
    return () => clearInterval(interval);
  }, [fetchOrder]);

  useEffect(() => {
    if (!chatOpen) return;
    fetchChat();
    const interval = setInterval(fetchChat, 3000);
    return () => clearInterval(interval);
  }, [chatOpen, fetchChat]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const patchOrder = async (action: string, txHash?: string) => {
    const res = await fetch("/api/exchange/orders", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: orderId, action, txHash }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Update failed");
    setOrder(data.order);
  };

  const handleMarkPaid = async () => {
    setActing(true);
    setError("");
    try {
      await patchOrder("mark_paid");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Update failed");
    } finally {
      setActing(false);
    }
  };

  const handleCancel = async () => {
    setActing(true);
    setError("");
    try {
      await patchOrder("cancel");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Update failed");
    } finally {
      setActing(false);
    }
  };

  // Real on-chain MON transfer to the merchant wallet (sell flow).
  const handleSendCrypto = async () => {
    if (!order || !account) return;
    if (typeof window === "undefined" || !window.ethereum) {
      setError("No browser wallet detected. Please use MetaMask or a similar wallet.");
      return;
    }
    setActing(true);
    setError("");
    try {
      try {
        await window.ethereum.request({
          method: "wallet_switchEthereumChain",
          params: [{ chainId: "0x279f" }],
        });
      } catch (switchError) {
        if ((switchError as { code?: number }).code === 4902) {
          await window.ethereum.request({
            method: "wallet_addEthereumChain",
            params: [{
              chainId: "0x279f",
              chainName: "Monad Testnet",
              nativeCurrency: { name: "MON", symbol: "MON", decimals: 18 },
              rpcUrls: ["https://testnet-rpc.monad.xyz"],
            }],
          });
        } else {
          throw new Error("Please switch to Monad Testnet in your wallet.");
        }
      }

      const walletClient = createWalletClient({ chain: MONAD_CHAIN as any, transport: custom(window.ethereum) });
      const publicClient = createPublicClient({ chain: MONAD_CHAIN as any, transport: http("https://testnet-rpc.monad.xyz") });

      const hash = await walletClient.sendTransaction({
        account: account.address as `0x${string}`,
        to: merchantAddress as `0x${string}`,
        value: parseEther(String(order.amountCrypto)),
        chain: MONAD_CHAIN as any,
      });
      await publicClient.waitForTransactionReceipt({ hash, confirmations: 1 });
      await patchOrder("crypto_sent", hash);
    } catch (err) {
      const e = err as { shortMessage?: string; message?: string };
      const msg = e.shortMessage || e.message || "Transaction failed";
      setError(msg.includes("User rejected") ? "Transaction cancelled." : msg);
    } finally {
      setActing(false);
    }
  };

  const handleSendChat = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim()) return;
    const text = chatInput;
    setChatInput("");
    try {
      await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tradeId: threadId,
          sender: "Customer",
          address: account?.address || order?.walletAddress || "guest",
          text,
        }),
      });
      fetchChat();
    } catch { /* silent */ }
  };

  const copyAccount = () => {
    if (!merchantBank) return;
    navigator.clipboard.writeText(merchantBank.accountNumber).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (notFound) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center px-6 py-24 text-center">
        <XCircle className="w-12 h-12 text-zinc-300 dark:text-zinc-700 mb-4" />
        <p className="text-lg font-bold text-zinc-900 dark:text-white mb-2">Order not found</p>
        <p className="text-sm text-zinc-500 mb-6">It may have expired — in-memory orders reset when the server restarts.</p>
        <Link href="/exchange" className="px-6 py-3 rounded-2xl bg-zinc-900 dark:bg-white text-white dark:text-black font-black uppercase tracking-widest text-xs">
          Back to Exchange
        </Link>
      </div>
    );
  }

  if (!order) {
    return (
      <div className="flex-1 flex items-center justify-center py-24">
        <Loader2 className="w-8 h-8 animate-spin text-zinc-900 dark:text-white" />
      </div>
    );
  }

  const isBuy = order.side === "buy";
  const step =
    order.status === "awaiting_payment" ? 1 :
    order.status === "confirming" ? 2 : 3;

  const steps = isBuy
    ? ["Transfer Naira", "Confirming payment", `${order.coin} released`]
    : ["Send MON", "Naira payout", "Naira sent"];

  return (
    <div className="flex-1 flex flex-col items-center py-8 sm:py-12 px-4 sm:px-6 w-full max-w-lg mx-auto z-10">
      <div className="w-full flex items-center justify-between mb-6">
        <Link
          href="/exchange"
          className="flex items-center gap-2 text-zinc-500 hover:text-zinc-900 dark:hover:text-white transition-colors group text-sm"
        >
          <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
          Exchange
        </Link>
        <span className="text-[10px] font-black uppercase tracking-widest text-zinc-400">
          Order {order.id}
        </span>
      </div>

      <div className="anim-fade-up w-full bg-zinc-50 dark:bg-zinc-900/40 border border-zinc-200 dark:border-zinc-800 rounded-[2rem] p-5 sm:p-8 backdrop-blur-xl shadow-2xl">

        {/* Amount summary */}
        <div className="text-center mb-7">
          <p className="text-[10px] font-black uppercase tracking-widest text-zinc-400 mb-1">
            {isBuy ? "Buying" : "Selling"}
          </p>
          <p className="text-3xl sm:text-4xl font-black text-zinc-900 dark:text-white">
            {order.amountCrypto.toLocaleString("en-US", { maximumFractionDigits: order.amountCrypto < 1 ? 6 : 4 })}{" "}
            <span className="text-zinc-500 dark:text-zinc-400">{order.coin}</span>
          </p>
          <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1 font-medium">
            {isBuy ? "for" : "you get"} ₦{order.amountNgn.toLocaleString("en-NG", { maximumFractionDigits: 0 })}
          </p>
        </div>

        {/* Stepper */}
        {order.status !== "cancelled" && (
          <div className="mb-8">
            <div className="flex items-center">
              {steps.map((label, i) => {
                const n = i + 1;
                const done = step > n;
                const active = step === n;
                return (
                  <div key={label} className="flex items-center flex-1 last:flex-none">
                    <div className="flex flex-col items-center">
                      <div
                        className={`w-9 h-9 rounded-full flex items-center justify-center text-xs font-black transition-all duration-700 ${
                          done
                            ? "bg-zinc-900 dark:bg-white text-white dark:text-black"
                            : active
                              ? "bg-zinc-900 dark:bg-white text-white dark:text-black shadow-lg scale-110 ring-4 ring-zinc-300 dark:ring-zinc-600"
                              : "bg-zinc-200 dark:bg-zinc-800 text-zinc-400"
                        }`}
                      >
                        {done ? <Check className="w-4 h-4" /> : n}
                      </div>
                    </div>
                    {n < steps.length && (
                      <div className="flex-1 h-1 mx-2 rounded-full bg-zinc-200 dark:bg-zinc-800 overflow-hidden">
                        <div
                          className={`h-full rounded-full bg-zinc-900 dark:bg-white transition-all duration-1000 ${done ? "w-full anim-progress" : "w-0"}`}
                        />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            <div className="flex justify-between mt-2.5">
              {steps.map((label, i) => (
                <span
                  key={label}
                  className={`text-[9px] sm:text-[10px] font-black uppercase tracking-wider transition-colors duration-500 ${
                    step >= i + 1 ? "text-zinc-900 dark:text-white" : "text-zinc-400 dark:text-zinc-600"
                  } ${i === 1 ? "text-center" : i === 2 ? "text-right" : ""}`}
                >
                  {label}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* ── State: BUY / awaiting payment ── */}
        {isBuy && order.status === "awaiting_payment" && merchantBank && (
          <div className="anim-fade-up">
            <div className="rounded-3xl bg-white dark:bg-black/50 border border-zinc-200 dark:border-zinc-800 p-5 mb-4">
              <div className="flex items-center gap-2 mb-4">
                <Landmark className="w-4 h-4 text-zinc-900 dark:text-white" />
                <p className="text-[10px] font-black uppercase tracking-widest text-zinc-400">
                  Transfer exactly ₦{order.amountNgn.toLocaleString("en-NG", { maximumFractionDigits: 0 })} to
                </p>
              </div>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-400">Bank</p>
                    <p className="text-sm font-bold text-zinc-900 dark:text-white">{merchantBank.bankName}</p>
                  </div>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-400">Account number</p>
                    <p className="text-xl font-black text-zinc-900 dark:text-white tracking-wider">{merchantBank.accountNumber}</p>
                  </div>
                  <button
                    onClick={copyAccount}
                    className={`p-2.5 rounded-xl border transition-all duration-300 ${
                      copied
                        ? "bg-zinc-900 dark:bg-white border-zinc-900 dark:border-white text-white dark:text-black"
                        : "bg-zinc-50 dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 text-zinc-500 hover:text-zinc-900 dark:hover:text-white"
                    }`}
                    aria-label="Copy account number"
                  >
                    {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                  </button>
                </div>
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-400">Account name</p>
                  <p className="text-sm font-bold text-zinc-900 dark:text-white">{merchantBank.accountName}</p>
                </div>
                <div className="pt-2 border-t border-zinc-100 dark:border-zinc-800">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-400">Narration / reference</p>
                  <p className="text-sm font-mono font-bold text-zinc-900 dark:text-white">{order.settlementRef}</p>
                </div>
              </div>
            </div>

            {error && (
              <div className="p-3.5 mb-4 rounded-2xl bg-zinc-100 dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 text-zinc-900 dark:text-white text-sm font-medium">
                ⚠️ {error}
              </div>
            )}

            <button
              onClick={handleMarkPaid}
              disabled={acting}
              className="w-full py-5 rounded-2xl bg-zinc-900 dark:bg-white text-white dark:text-black font-black uppercase tracking-widest text-sm hover:scale-[1.02] active:scale-[0.97] transition-all duration-300 disabled:opacity-50 shadow-xl flex items-center justify-center gap-2.5"
            >
              {acting ? <Loader2 className="w-5 h-5 animate-spin" /> : "I have sent the Naira"}
            </button>
            <button
              onClick={handleCancel}
              disabled={acting}
              className="w-full mt-3 py-2 text-[11px] font-bold uppercase tracking-widest text-zinc-400 hover:text-zinc-900 dark:hover:text-white underline underline-offset-2 transition-colors"
            >
              Cancel order
            </button>
          </div>
        )}

        {/* ── State: SELL / awaiting crypto ── */}
        {!isBuy && order.status === "awaiting_payment" && (
          <div className="anim-fade-up">
            <div className="rounded-3xl bg-white dark:bg-black/50 border border-zinc-200 dark:border-zinc-800 p-5 mb-4">
              <p className="text-[10px] font-black uppercase tracking-widest text-zinc-400 mb-2">Payout destination</p>
              <p className="text-sm font-bold text-zinc-900 dark:text-white">
                {order.bank?.accountName} · {order.bank?.bankName}
              </p>
              <p className="text-lg font-black text-zinc-900 dark:text-white tracking-wider">{order.bank?.accountNumber}</p>
              <p className="text-[11px] text-zinc-400 mt-3 leading-relaxed">
                Tap the button below to send{" "}
                <span className="font-bold text-zinc-700 dark:text-zinc-200">{order.amountCrypto} MON</span> from your
                wallet to the exchange. Your Naira payout starts the moment the transfer confirms on-chain.
              </p>
            </div>

            {!account && (
              <div className="p-3.5 mb-4 rounded-2xl bg-zinc-100 dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 text-zinc-900 dark:text-white text-sm font-medium">
                Connect your wallet (top right) to send MON.
              </div>
            )}

            {error && (
              <div className="p-3.5 mb-4 rounded-2xl bg-zinc-100 dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 text-zinc-900 dark:text-white text-sm font-medium">
                ⚠️ {error}
              </div>
            )}

            <button
              onClick={handleSendCrypto}
              disabled={acting || !account}
              className="w-full py-5 rounded-2xl bg-zinc-900 dark:bg-white text-white dark:text-black font-black uppercase tracking-widest text-sm hover:scale-[1.02] active:scale-[0.97] transition-all duration-300 disabled:opacity-40 shadow-xl flex items-center justify-center gap-2.5"
            >
              {acting ? (
                <><Loader2 className="w-5 h-5 animate-spin" /> Confirming on Monad…</>
              ) : (
                <>Send {order.amountCrypto} MON</>
              )}
            </button>
            <button
              onClick={handleCancel}
              disabled={acting}
              className="w-full mt-3 py-2 text-[11px] font-bold uppercase tracking-widest text-zinc-400 hover:text-zinc-900 dark:hover:text-white underline underline-offset-2 transition-colors"
            >
              Cancel order
            </button>
          </div>
        )}

        {/* ── State: confirming ── */}
        {order.status === "confirming" && (
          <div className="anim-fade-up rounded-3xl bg-white dark:bg-black/50 border border-zinc-200 dark:border-zinc-800 p-6 relative overflow-hidden">
            <div className="absolute inset-0 anim-shimmer pointer-events-none" />
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-2xl bg-zinc-100 dark:bg-white/10 flex items-center justify-center shrink-0">
                <Loader2 className="w-6 h-6 text-zinc-900 dark:text-white animate-spin" />
              </div>
              <div>
                <p className="text-sm font-black text-zinc-900 dark:text-white">
                  {isBuy ? "Confirming your Naira transfer…" : "Sending Naira to your bank…"}
                </p>
                <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1 leading-relaxed">
                  {isBuy
                    ? `Once confirmed, ${order.amountCrypto.toLocaleString("en-US", { maximumFractionDigits: 6 })} ${order.coin} goes straight to your wallet. Usually under a minute.`
                    : `₦${order.amountNgn.toLocaleString("en-NG", { maximumFractionDigits: 0 })} is on its way to ${order.bank?.bankName}. Usually under a minute.`}
                </p>
              </div>
            </div>
            {order.txHash && (
              <a
                href={`https://monad-testnet.socialscan.io/tx/${order.txHash}`}
                target="_blank" rel="noreferrer"
                className="mt-4 flex items-center gap-1.5 text-[11px] font-bold text-zinc-900 dark:text-white underline underline-offset-2"
              >
                View your MON transfer on-chain <ExternalLink className="w-3 h-3" />
              </a>
            )}
          </div>
        )}

        {/* ── State: completed ── */}
        {order.status === "completed" && (
          <div className="anim-scale-in text-center">
            <div className="w-20 h-20 bg-zinc-100 dark:bg-white/10 rounded-full flex items-center justify-center mx-auto mb-5 border border-zinc-300 dark:border-white/20">
              <CheckCircle2 className="w-10 h-10 text-zinc-900 dark:text-white" />
            </div>
            <h3 className="text-xl font-black text-zinc-900 dark:text-white uppercase tracking-tight mb-2">
              {isBuy ? `${order.coin} delivered!` : "Naira sent!"}
            </h3>
            <p className="text-sm text-zinc-500 dark:text-zinc-400 mb-5 leading-relaxed">
              {isBuy
                ? `${order.amountCrypto.toLocaleString("en-US", { maximumFractionDigits: 6 })} ${order.coin} was released to ${order.walletAddress.slice(0, 8)}…${order.walletAddress.slice(-6)}.`
                : `₦${order.amountNgn.toLocaleString("en-NG", { maximumFractionDigits: 0 })} was sent to your ${order.bank?.bankName} account.`}
            </p>
            <div className="rounded-2xl bg-zinc-100 dark:bg-black/40 border border-zinc-200 dark:border-zinc-800 p-4 mb-5">
              <p className="text-[10px] font-black uppercase tracking-widest text-zinc-400 mb-1">Settlement reference</p>
              <p className="text-sm font-mono font-bold text-zinc-900 dark:text-white">{order.settlementRef}</p>
              {order.payoutTxHash && (
                <a
                  href={`https://monad-testnet.socialscan.io/tx/${order.payoutTxHash}`}
                  target="_blank" rel="noreferrer"
                  className="mt-2 inline-flex items-center gap-1.5 text-[11px] font-bold text-zinc-900 dark:text-white underline underline-offset-2"
                >
                  View payout transaction <ExternalLink className="w-3 h-3" />
                </a>
              )}
            </div>
            <Link
              href="/exchange"
              className="block w-full py-4 rounded-2xl bg-zinc-900 dark:bg-white text-white dark:text-black font-black uppercase tracking-widest text-sm hover:scale-[1.02] active:scale-[0.97] transition-all duration-300"
            >
              Done
            </Link>
          </div>
        )}

        {/* ── State: cancelled ── */}
        {order.status === "cancelled" && (
          <div className="anim-fade-up text-center py-4">
            <XCircle className="w-12 h-12 text-zinc-300 dark:text-zinc-700 mx-auto mb-3" />
            <p className="text-sm font-bold text-zinc-900 dark:text-white mb-5">This order was cancelled.</p>
            <Link
              href="/exchange"
              className="inline-block px-8 py-3.5 rounded-2xl bg-zinc-900 dark:bg-white text-white dark:text-black font-black uppercase tracking-widest text-xs"
            >
              Start a new order
            </Link>
          </div>
        )}
      </div>

      {/* ── Support chat ── */}
      <div className="w-full mt-4">
        {!chatOpen ? (
          <button
            onClick={() => setChatOpen(true)}
            className="anim-fade-up anim-delay-2 w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-300 text-sm font-bold hover:border-zinc-400 dark:hover:border-zinc-500 transition-all duration-300"
          >
            <MessageSquare className="w-4 h-4 text-zinc-900 dark:text-white" />
            Need help? Chat with support
          </button>
        ) : (
          <div className="anim-scale-in bg-white dark:bg-zinc-900/60 border border-zinc-200 dark:border-zinc-800 rounded-3xl overflow-hidden shadow-xl">
            <div className="px-4 py-3 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between bg-zinc-50 dark:bg-zinc-900">
              <div className="flex items-center gap-2">
                <MessageSquare className="w-4 h-4 text-zinc-900 dark:text-white" />
                <span className="text-xs font-black uppercase tracking-widest text-zinc-900 dark:text-white">Support · Order {order.id}</span>
              </div>
              <button onClick={() => setChatOpen(false)} className="text-[10px] font-black uppercase tracking-widest text-zinc-400 hover:text-zinc-900 dark:hover:text-white transition-colors">
                Close
              </button>
            </div>
            <div className="max-h-72 overflow-y-auto p-4 space-y-3">
              {messages.map((msg) => {
                const isMe = !msg.isAdmin && msg.address !== "system";
                return (
                  <div key={msg.id} className={`flex ${isMe ? "justify-end" : "justify-start"}`}>
                    <div className={`max-w-[85%] px-4 py-2.5 rounded-2xl text-sm leading-relaxed ${
                      isMe
                        ? "bg-zinc-900 text-white dark:bg-white dark:text-black rounded-tr-sm"
                        : "bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-white rounded-tl-sm"
                    }`}>
                      {!isMe && (
                        <p className="text-[9px] font-black uppercase tracking-widest text-zinc-500 dark:text-zinc-400 mb-0.5">{msg.sender}</p>
                      )}
                      {msg.text}
                    </div>
                  </div>
                );
              })}
              <div ref={chatEndRef} />
            </div>
            <form onSubmit={handleSendChat} className="p-3 border-t border-zinc-200 dark:border-zinc-800 flex gap-2">
              <input
                type="text"
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                placeholder="Describe your issue…"
                className="flex-1 px-4 py-3 bg-zinc-100 dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-700 rounded-xl focus:outline-none focus:border-zinc-500 dark:focus:border-zinc-400 text-sm transition-all"
              />
              <button
                type="submit"
                disabled={!chatInput.trim()}
                className="p-3 bg-zinc-900 dark:bg-white text-white dark:text-black rounded-xl disabled:opacity-50 active:scale-90 transition-all"
                aria-label="Send"
              >
                <Send className="w-4 h-4" />
              </button>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
