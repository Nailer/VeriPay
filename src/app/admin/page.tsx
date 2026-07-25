"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ShieldCheck, MessageSquare, ArrowLeftRight, Send, ArrowLeft,
  Loader2, Lock, Eye, BarChart3, Users, Wallet, Coins, Inbox,
} from "lucide-react";
import AdminOrderCard, { type AdminOrder } from "@/components/AdminOrderCard";

type ChatMessage = {
  id: number;
  sender: string;
  address: string;
  text: string;
  time: string;
  isAdmin: boolean;
};

type ThreadSummary = {
  threadId: string;
  kind: "escrow" | "exchange";
  messageCount: number;
  lastMessage: ChatMessage | null;
  participants: string[];
};

type Queue = {
  actionable: number;
  awaitingBuyerFunds: number;
  ngnToCollect: number;
  ngnToPayOut: number;
};

type Stats = {
  uniqueWallets: number;
  walletConnects24h: number;
  totalTrades: number;
  settledTrades: number;
  totalVolumeMon: string;
  totalExchangeOrders: number;
  completedExchangeOrders: number;
  buyOrders: number;
  sellOrders: number;
  totalExchangeVolumeNgn: number;
  totalChatMessages: number;
  pageViews7d: number;
};

export default function AdminPage() {
  const [passcode, setPasscode] = useState("");
  const [authed, setAuthed] = useState(false);
  const [authError, setAuthError] = useState("");
  const [checking, setChecking] = useState(false);

  const [tab, setTab] = useState<"orders" | "stats" | "chats">("orders");
  const [threads, setThreads] = useState<ThreadSummary[]>([]);
  const [orders, setOrders] = useState<AdminOrder[]>([]);
  const [queue, setQueue] = useState<Queue | null>(null);
  const [hotWallet, setHotWallet] = useState(false);
  const [stats, setStats] = useState<Stats | null>(null);
  const [activeThread, setActiveThread] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [reply, setReply] = useState("");
  const chatEndRef = useRef<HTMLDivElement>(null);

  const headers = useCallback(
    (): HeadersInit => ({ "Content-Type": "application/json", "x-admin-code": passcode }),
    [passcode]
  );

  // Restore passcode from a previous session in this tab
  useEffect(() => {
    const saved = sessionStorage.getItem("mp-admin-code");
    if (saved) {
      setPasscode(saved);
      setAuthed(true);
    }
  }, []);

  const fetchThreads = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/chats", { headers: headers() });
      if (res.status === 401) { setAuthed(false); return; }
      if (res.ok) setThreads((await res.json()).threads ?? []);
    } catch { /* silent */ }
  }, [headers]);

  const fetchOrders = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/orders", { headers: headers() });
      if (res.ok) {
        const data = await res.json();
        setOrders(data.orders ?? []);
        setQueue(data.queue ?? null);
        setHotWallet(Boolean(data.hotWallet));
      }
    } catch { /* silent */ }
  }, [headers]);

  /** Fulfilment actions. Errors surface inside the order card. */
  const handleOrderAction = useCallback(
    async (id: string, action: string, extra: Record<string, unknown> = {}) => {
      const res = await fetch("/api/admin/orders", {
        method: "POST",
        headers: headers(),
        body: JSON.stringify({ id, action, ...extra }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Action failed");
      await fetchOrders();
    },
    [headers, fetchOrders]
  );

  const fetchStats = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/stats", { headers: headers() });
      if (res.ok) setStats(await res.json());
    } catch { /* silent */ }
  }, [headers]);

  const fetchMessages = useCallback(async () => {
    if (!activeThread) return;
    try {
      const res = await fetch(`/api/admin/chats?thread=${encodeURIComponent(activeThread)}`, { headers: headers() });
      if (res.ok) setMessages((await res.json()).messages ?? []);
    } catch { /* silent */ }
  }, [activeThread, headers]);

  useEffect(() => {
    if (!authed) return;
    fetchThreads();
    fetchOrders();
    fetchStats();
    const interval = setInterval(() => { fetchThreads(); fetchOrders(); fetchStats(); }, 5000);
    return () => clearInterval(interval);
  }, [authed, fetchThreads, fetchOrders, fetchStats]);

  useEffect(() => {
    if (!authed || !activeThread) return;
    fetchMessages();
    const interval = setInterval(fetchMessages, 3000);
    return () => clearInterval(interval);
  }, [authed, activeThread, fetchMessages]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setChecking(true);
    setAuthError("");
    try {
      const res = await fetch("/api/admin/chats", { headers: { "x-admin-code": passcode } });
      if (res.ok) {
        sessionStorage.setItem("mp-admin-code", passcode);
        setAuthed(true);
      } else if (res.status === 401) {
        setAuthError("Wrong passcode.");
      } else if (res.status === 404) {
        // Only 401 means the passcode is wrong. A 404 means the admin API isn't
        // being served at all — usually a stale .next cache after switching
        // between `next build` and `next dev`. Saying "wrong passcode" here
        // sends you hunting for the wrong problem.
        setAuthError("Admin API not found (404). Stop the server, delete .next, and restart.");
      } else {
        setAuthError(`Server error (${res.status}). Check the server logs.`);
      }
    } catch {
      setAuthError("Could not reach the server. Is it still running?");
    } finally {
      setChecking(false);
    }
  };

  const handleReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reply.trim() || !activeThread) return;
    const text = reply;
    setReply("");
    try {
      await fetch("/api/admin/chats", {
        method: "POST",
        headers: headers(),
        body: JSON.stringify({ threadId: activeThread, text }),
      });
      fetchMessages();
    } catch { /* silent */ }
  };

  // ─── Passcode gate ────────────────────────────────────────────────────────
  if (!authed) {
    return (
      <div className="flex-1 flex items-center justify-center px-5 py-20">
        <form onSubmit={handleLogin} className="anim-scale-in w-full max-w-sm bg-zinc-50 dark:bg-zinc-900/40 border border-zinc-200 dark:border-zinc-800 rounded-[2rem] p-8 text-center shadow-2xl">
          <div className="w-14 h-14 rounded-2xl bg-zinc-100 dark:bg-white/10 flex items-center justify-center mx-auto mb-5">
            <Lock className="w-6 h-6 text-zinc-900 dark:text-white" />
          </div>
          <h1 className="text-xl font-black text-zinc-900 dark:text-white uppercase tracking-tight mb-1.5">Admin Console</h1>
          <p className="text-xs text-zinc-500 mb-6">Usage stats, every chat, and every exchange order.</p>
          <input
            type="password"
            value={passcode}
            onChange={(e) => setPasscode(e.target.value)}
            placeholder="Passcode"
            className="w-full bg-white dark:bg-black/50 border border-zinc-200 dark:border-zinc-800 rounded-2xl px-4 py-3.5 text-center text-zinc-900 dark:text-white focus:outline-none focus:border-zinc-500 dark:focus:border-zinc-400 transition-all mb-4"
          />
          {authError && <p className="text-xs font-black text-zinc-900 dark:text-white mb-4">{authError}</p>}
          <button
            type="submit"
            disabled={!passcode || checking}
            className="w-full py-4 rounded-2xl bg-zinc-900 dark:bg-white text-white dark:text-black font-black uppercase tracking-widest text-xs disabled:opacity-50 hover:scale-[1.02] active:scale-[0.97] transition-all duration-300 flex items-center justify-center gap-2"
          >
            {checking ? <Loader2 className="w-4 h-4 animate-spin" /> : "Enter"}
          </button>
        </form>
      </div>
    );
  }

  // ─── Conversation view ────────────────────────────────────────────────────
  if (activeThread) {
    const isExchange = activeThread.startsWith("ex-");
    return (
      <div className="flex-1 flex flex-col w-full max-w-3xl mx-auto px-4 sm:px-6 py-6" style={{ minHeight: "calc(100dvh - 57px)" }}>
        <button
          onClick={() => { setActiveThread(null); setMessages([]); }}
          className="self-start flex items-center gap-2 text-zinc-500 hover:text-zinc-900 dark:hover:text-white transition-colors mb-4 group text-sm"
        >
          <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
          All chats
        </button>

        <div className="anim-fade-up flex-1 flex flex-col bg-white dark:bg-zinc-900/40 border border-zinc-200 dark:border-zinc-800 rounded-3xl overflow-hidden shadow-xl min-h-0">
          <div className="px-5 py-4 border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/80 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-black text-zinc-900 dark:text-white">
                {isExchange ? `Exchange Order ${activeThread.slice(3).toUpperCase()}` : `Escrow Trade #00${activeThread}`}
              </h2>
              <p className="text-[10px] text-zinc-500 uppercase tracking-widest font-bold mt-0.5 flex items-center gap-1.5">
                <Eye className="w-3 h-3" /> Admin oversight — you can reply as Admin
              </p>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-5 space-y-4 min-h-0">
            {messages.map((msg) => (
              <div key={msg.id} className={`flex ${msg.isAdmin ? "justify-end" : "justify-start"}`}>
                <div className="max-w-[85%]">
                  <div className="flex items-center gap-2 mb-1 px-1">
                    <span className={`text-[10px] font-black uppercase tracking-widest ${msg.isAdmin ? "text-zinc-900 dark:text-white" : "text-zinc-500"}`}>
                      {msg.sender}
                    </span>
                    {msg.address && msg.address !== "system" && msg.address !== "admin" && (
                      <span className="text-[9px] font-mono text-zinc-400">
                        {msg.address.slice(0, 6)}…{msg.address.slice(-4)}
                      </span>
                    )}
                    <span className="text-[9px] text-zinc-400">{msg.time}</span>
                  </div>
                  <div className={`px-4 py-2.5 rounded-2xl text-sm leading-relaxed ${
                    msg.isAdmin
                      ? "bg-zinc-900 text-white dark:bg-white dark:text-black rounded-tr-sm"
                      : "bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-white rounded-tl-sm"
                  }`}>
                    {msg.text}
                  </div>
                </div>
              </div>
            ))}
            <div ref={chatEndRef} />
          </div>

          <form onSubmit={handleReply} className="p-3 border-t border-zinc-200 dark:border-zinc-800 flex gap-2 bg-white dark:bg-zinc-900">
            <input
              type="text"
              value={reply}
              onChange={(e) => setReply(e.target.value)}
              placeholder="Reply as Admin…"
              className="flex-1 px-4 py-3 bg-zinc-100 dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-700 rounded-xl focus:outline-none focus:border-zinc-500 dark:focus:border-zinc-400 text-sm transition-all"
            />
            <button
              type="submit"
              disabled={!reply.trim()}
              className="p-3 bg-zinc-900 dark:bg-white text-white dark:text-black rounded-xl disabled:opacity-50 active:scale-90 transition-all"
              aria-label="Send as Admin"
            >
              <Send className="w-4 h-4" />
            </button>
          </form>
        </div>
      </div>
    );
  }

  // ─── Overview: chats + orders ─────────────────────────────────────────────
  return (
    <div className="flex-1 w-full max-w-3xl mx-auto px-4 sm:px-6 py-8">
      <div className="anim-fade-up flex items-center gap-3 mb-6">
        <div className="w-10 h-10 bg-zinc-100 dark:bg-white/10 rounded-xl flex items-center justify-center">
          <ShieldCheck className="w-5 h-5 text-zinc-900 dark:text-white" />
        </div>
        <div>
          <h1 className="text-2xl font-black text-zinc-900 dark:text-white tracking-tight">Admin Console</h1>
          <p className="text-xs text-zinc-500 font-medium">
            {queue?.actionable ? `${queue.actionable} order${queue.actionable === 1 ? "" : "s"} waiting on you` : "Fulfilment, chats and usage — live."}
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="anim-fade-up anim-delay-1 flex gap-2 mb-5 flex-wrap">
        {([
          { key: "orders", label: "Fulfilment", icon: <ArrowLeftRight className="w-3.5 h-3.5" /> },
          { key: "chats", label: "Chats", icon: <MessageSquare className="w-3.5 h-3.5" /> },
          { key: "stats", label: "Stats", icon: <BarChart3 className="w-3.5 h-3.5" /> },
        ] as const).map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-full text-xs font-black uppercase tracking-wider transition-all duration-300 border ${
              tab === t.key
                ? "bg-zinc-900 dark:bg-white text-white dark:text-black border-zinc-900 dark:border-white"
                : "bg-white dark:bg-zinc-900 text-zinc-500 border-zinc-200 dark:border-zinc-800"
            }`}
          >
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {tab === "stats" && (
        <div className="anim-fade-up anim-delay-2">
          {!stats ? (
            <div className="text-center py-16 text-sm text-zinc-400 font-medium">Loading stats…</div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {[
                { label: "Unique Wallets", value: stats.uniqueWallets, icon: <Users className="w-4 h-4" /> },
                { label: "Connects (24h)", value: stats.walletConnects24h, icon: <Wallet className="w-4 h-4" /> },
                { label: "Escrow Trades", value: stats.totalTrades, icon: <ShieldCheck className="w-4 h-4" /> },
                { label: "Trades Settled", value: stats.settledTrades, icon: <ShieldCheck className="w-4 h-4" /> },
                { label: "MON Volume", value: `${Number(stats.totalVolumeMon).toLocaleString(undefined, { maximumFractionDigits: 4 })}`, icon: <Coins className="w-4 h-4" /> },
                { label: "Exchange Orders", value: stats.totalExchangeOrders, icon: <ArrowLeftRight className="w-4 h-4" /> },
                { label: "Orders Completed", value: stats.completedExchangeOrders, icon: <ArrowLeftRight className="w-4 h-4" /> },
                { label: "Buy / Sell Split", value: `${stats.buyOrders} / ${stats.sellOrders}`, icon: <ArrowLeftRight className="w-4 h-4" /> },
                { label: "NGN Volume", value: `₦${stats.totalExchangeVolumeNgn.toLocaleString("en-NG", { maximumFractionDigits: 0 })}`, icon: <Coins className="w-4 h-4" /> },
                { label: "Chat Messages", value: stats.totalChatMessages, icon: <MessageSquare className="w-4 h-4" /> },
                { label: "Page Views (7d)", value: stats.pageViews7d, icon: <BarChart3 className="w-4 h-4" /> },
              ].map((s) => (
                <div key={s.label} className="p-4 rounded-2xl bg-white dark:bg-zinc-900/50 border border-zinc-200 dark:border-zinc-800">
                  <div className="flex items-center gap-2 text-zinc-400 mb-2">
                    {s.icon}
                    <span className="text-[9px] font-black uppercase tracking-widest">{s.label}</span>
                  </div>
                  <p className="text-xl font-black text-zinc-900 dark:text-white">{s.value}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === "chats" && (
        <div className="anim-fade-up anim-delay-2 space-y-2.5">
          {threads.length === 0 && (
            <div className="text-center py-16 text-sm text-zinc-400 font-medium">
              No chats yet. Threads appear here the moment anyone opens a trade or order chat.
            </div>
          )}
          {threads.map((t) => (
            <button
              key={t.threadId}
              onClick={() => setActiveThread(t.threadId)}
              className="w-full text-left p-4 rounded-2xl bg-white dark:bg-zinc-900/50 border border-zinc-200 dark:border-zinc-800 hover:border-zinc-400 dark:hover:border-zinc-500 transition-all duration-300 hover:-translate-y-0.5"
            >
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2.5 min-w-0">
                  <span className={`shrink-0 px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-widest ${
                    t.kind === "exchange"
                      ? "bg-zinc-900 dark:bg-white text-white dark:text-black"
                      : "bg-zinc-200 dark:bg-zinc-700 text-zinc-900 dark:text-white"
                  }`}>
                    {t.kind}
                  </span>
                  <span className="text-sm font-bold text-zinc-900 dark:text-white truncate">
                    {t.kind === "exchange" ? `Order ${t.threadId.slice(3).toUpperCase()}` : `Trade #00${t.threadId}`}
                  </span>
                </div>
                <span className="text-[10px] text-zinc-400 font-bold shrink-0">{t.messageCount} msgs</span>
              </div>
              {t.lastMessage && (
                <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1.5 truncate">
                  <span className="font-bold">{t.lastMessage.sender}:</span> {t.lastMessage.text}
                </p>
              )}
            </button>
          ))}
        </div>
      )}

      {tab === "orders" && (
        <div className="anim-fade-up anim-delay-2">
          {/* Queue summary */}
          {queue && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 mb-5">
              {[
                { label: "Needs action", value: String(queue.actionable), highlight: queue.actionable > 0 },
                { label: "Awaiting funds", value: String(queue.awaitingBuyerFunds), highlight: false },
                { label: "To collect", value: `₦${queue.ngnToCollect.toLocaleString("en-NG", { maximumFractionDigits: 0 })}`, highlight: false },
                { label: "To pay out", value: `₦${queue.ngnToPayOut.toLocaleString("en-NG", { maximumFractionDigits: 0 })}`, highlight: false },
              ].map((s) => (
                <div key={s.label} className={`p-3 rounded-2xl border ${
                  s.highlight
                    ? "bg-zinc-900 dark:bg-white border-zinc-900 dark:border-white text-white dark:text-black"
                    : "bg-white dark:bg-zinc-900/50 border-zinc-200 dark:border-zinc-800"
                }`}>
                  <p className={`text-[9px] font-black uppercase tracking-widest ${s.highlight ? "opacity-70" : "text-zinc-400"}`}>
                    {s.label}
                  </p>
                  <p className={`text-lg font-black mt-0.5 ${s.highlight ? "" : "text-zinc-900 dark:text-white"}`}>
                    {s.value}
                  </p>
                </div>
              ))}
            </div>
          )}

          {!hotWallet && (
            <div className="mb-5 px-4 py-3 rounded-2xl bg-zinc-100 dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700">
              <p className="text-[11px] font-bold text-zinc-700 dark:text-zinc-300 leading-relaxed">
                No payout wallet configured — after confirming a payment you&apos;ll send the crypto yourself and paste
                the transaction hash. Set <span className="font-mono">EXCHANGE_PAYOUT_PRIVATE_KEY</span> to automate it.
              </p>
            </div>
          )}

          <div className="space-y-2.5">
            {orders.length === 0 && (
              <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
                <Inbox className="w-8 h-8 text-zinc-300 dark:text-zinc-700" />
                <p className="text-sm text-zinc-400 font-medium">No exchange orders yet.</p>
              </div>
            )}
            {orders.map((o) => (
              <AdminOrderCard
                key={o.id}
                order={o}
                hotWallet={hotWallet}
                onAction={(action, extra) => handleOrderAction(o.id, action, extra)}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
