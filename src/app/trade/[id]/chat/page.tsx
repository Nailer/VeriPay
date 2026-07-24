"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, ShieldCheck, Send, Lock, CheckCheck } from "lucide-react";
import { useActiveAccount } from "thirdweb/react";
import { createPublicClient, http } from "viem";
import { CONTRACT_ADDRESS, escrowAbi } from "@/lib/abi";

export default function ChatPage() {
  const params = useParams();
  const idStr = params?.id as string;

  const account = useActiveAccount();
  const [inputValue, setInputValue] = useState("");
  const [messages, setMessages] = useState<any[]>([]);
  const [trade, setTrade] = useState<any>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to newest message
  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  const fetchTrade = useCallback(async () => {
    if (!idStr) return;
    try {
      const publicClient = createPublicClient({
        chain: {
          id: 10143, name: "Monad Testnet",
          nativeCurrency: { name: "MON", symbol: "MON", decimals: 18 },
          rpcUrls: { default: { http: ["https://testnet-rpc.monad.xyz"] }, public: { http: ["https://testnet-rpc.monad.xyz"] } },
        } as any,
        transport: http("https://testnet-rpc.monad.xyz"),
      });

      const res = await publicClient.readContract({
        address: CONTRACT_ADDRESS,
        abi: escrowAbi,
        functionName: "trades",
        args: [BigInt(idStr)],
      }) as any;

      setTrade({ buyer: res[0], seller: res[1] });
    } catch (err) {
      console.error("Fetch trade error:", err);
    }
  }, [idStr]);

  const fetchMessages = useCallback(async () => {
    if (!idStr) return;
    try {
      const res = await fetch(`/api/chat?tradeId=${idStr}`);
      if (res.ok) {
        const data = await res.json();
        setMessages(data.messages);
      }
    } catch (err) {
      console.error("Fetch messages error:", err);
    }
  }, [idStr]);

  useEffect(() => {
    fetchTrade();
    fetchMessages();
    const interval = setInterval(fetchMessages, 2000);
    return () => clearInterval(interval);
  }, [fetchTrade, fetchMessages]);

  // Scroll to bottom when new messages arrive
  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputValue.trim() || !account || !trade) return;

    const userAddress = account.address;
    let senderRole = "Observer";
    if (userAddress.toLowerCase() === trade.buyer.toLowerCase()) senderRole = "Buyer";
    else if (userAddress.toLowerCase() === trade.seller.toLowerCase()) senderRole = "Seller";

    const textToSend = inputValue;
    setInputValue("");

    try {
      await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tradeId: idStr, sender: senderRole, address: userAddress, text: textToSend }),
      });
      fetchMessages();

      // Notify the other party
      if (trade) {
        const recipientAddress =
          userAddress.toLowerCase() === trade.buyer.toLowerCase() ? trade.seller : trade.buyer;

        if (recipientAddress && recipientAddress.toLowerCase() !== userAddress.toLowerCase()) {
          await fetch("/api/notifications", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              toAddress: recipientAddress,
              type: "chat",
              tradeId: idStr,
              fromAddress: userAddress,
              message: textToSend.length > 60 ? textToSend.slice(0, 60) + "…" : textToSend,
            }),
          }).catch(() => {});
        }
      }
    } catch (err) {
      console.error("Send message error:", err);
    }
  };

  return (
    /**
     * Full-height layout that works on mobile:
     * - `h-[100dvh]` uses dynamic viewport height so the input stays above the keyboard
     * - The outer div handles the navbar offset with `pt-[57px]` compensation built into layout
     */
    <div className="flex flex-col w-full max-w-4xl mx-auto px-3 sm:px-6 pb-3 sm:pb-6 pt-2 sm:pt-6 relative z-10 transition-colors duration-300"
      style={{ height: "calc(100dvh - 57px)" }}>

      {/* Top Navigation */}
      <div className="flex items-center justify-between mb-3 sm:mb-5 flex-shrink-0">
        <Link href={`/trade/${idStr}`} className="inline-flex items-center gap-2 text-zinc-600 dark:text-zinc-500 hover:text-zinc-900 dark:hover:text-white transition-colors font-bold uppercase tracking-widest text-[10px]">
          <ArrowLeft className="w-4 h-4" /> Back to Trade
        </Link>
        <div className="flex items-center gap-1.5 px-2.5 py-1 bg-zinc-100 dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-600 rounded-full">
          <ShieldCheck className="w-3 h-3 text-zinc-900 dark:text-white" />
          <span className="text-[9px] sm:text-[10px] font-black text-zinc-900 dark:text-white uppercase tracking-widest hidden xs:block">Encrypted</span>
        </div>
      </div>

      {/* Encryption Banner */}
      <div className="mb-3 sm:mb-4 p-3 sm:p-4 rounded-xl sm:rounded-2xl bg-zinc-100 dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-800 flex items-start gap-3 flex-shrink-0 transition-colors">
        <div className="p-1.5 bg-zinc-200 dark:bg-zinc-700 rounded-full mt-0.5 shrink-0">
          <Lock className="w-3.5 h-3.5 text-zinc-600 dark:text-zinc-300" />
        </div>
        <div>
          <h4 className="text-xs sm:text-sm font-bold text-zinc-900 dark:text-white leading-tight">Secure Resolution Channel</h4>
          <p className="text-[11px] sm:text-xs text-zinc-600 dark:text-zinc-400 mt-0.5 leading-relaxed">
            Encrypted channel for Trade #{`00${idStr}`}. Do not share your private keys.
          </p>
        </div>
      </div>

      {/* Chat Interface — fills remaining height */}
      <div className="flex-1 flex flex-col bg-white dark:bg-zinc-900/40 border border-zinc-200 dark:border-zinc-800 rounded-[1.5rem] sm:rounded-[2rem] overflow-hidden shadow-2xl min-h-0">

        {/* Chat Header */}
        <div className="px-4 sm:px-6 py-3.5 sm:py-4 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between bg-zinc-50 dark:bg-zinc-900/80 flex-shrink-0">
          <div>
            <h3 className="text-sm sm:text-base font-black text-zinc-900 dark:text-white">Dispute Resolution</h3>
            <p className="text-[10px] text-zinc-500 uppercase tracking-widest mt-0.5 font-bold">Trade #00{idStr}</p>
          </div>
          <div className="flex -space-x-1.5 sm:-space-x-2">
            <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-full border-2 border-white dark:border-zinc-900 bg-zinc-900 dark:bg-white flex items-center justify-center text-[9px] sm:text-[10px] font-bold text-white dark:text-black z-20">A</div>
            <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-full border-2 border-white dark:border-zinc-900 bg-zinc-600 flex items-center justify-center text-[9px] sm:text-[10px] font-bold text-white z-10">B</div>
            <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-full border-2 border-white dark:border-zinc-900 bg-zinc-800 flex items-center justify-center text-[9px] sm:text-[10px] font-bold text-white">S</div>
          </div>
        </div>

        {/* Messages — scrollable area */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 sm:space-y-6 bg-zinc-50/50 dark:bg-transparent flex flex-col">
          {messages.map((msg) => {
            const isMe = account?.address && msg.address &&
              account.address.toLowerCase() === msg.address.toLowerCase();
            return (
              <div key={msg.id} className={`flex w-full ${isMe ? "justify-end" : "justify-start"}`}>
                <div className={`flex flex-col max-w-[85%] sm:max-w-[80%] ${isMe ? "items-end" : "items-start"}`}>
                  {!isMe && (
                    <div className="flex items-center gap-2 mb-1 pl-1">
                      {msg.isAdmin
                        ? <span className="text-[10px] font-black uppercase tracking-widest text-zinc-900 dark:text-white">Admin</span>
                        : <span className="text-[10px] font-black uppercase tracking-widest text-zinc-500">{msg.sender}</span>}
                    </div>
                  )}
                  <div className={`px-4 sm:px-5 py-2.5 sm:py-3 rounded-2xl text-sm leading-relaxed ${
                    msg.isAdmin
                      ? "bg-zinc-200 dark:bg-zinc-800 text-zinc-900 dark:text-white rounded-tl-sm"
                      : isMe
                        ? "bg-zinc-900 text-white dark:bg-white dark:text-black rounded-tr-sm shadow-md"
                        : "bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-zinc-900 dark:text-white rounded-tl-sm shadow-sm"
                  }`}>
                    {msg.text}
                  </div>
                  <div className="flex items-center gap-1 mt-1 pr-1 text-[10px] font-medium text-zinc-400">
                    {msg.time}
                    {isMe && <CheckCheck className="w-3 h-3 text-zinc-900 dark:text-white" />}
                  </div>
                </div>
              </div>
            );
          })}
          {/* Scroll anchor */}
          <div ref={messagesEndRef} />
        </div>

        {/* Chat Input — always visible above keyboard */}
        <div className="p-3 sm:p-4 border-t border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 flex-shrink-0">
          <form onSubmit={handleSend} className="flex items-center gap-2 sm:gap-3">
            <input
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              placeholder="Type your message..."
              className="flex-1 pl-4 sm:pl-5 pr-3 py-3 sm:py-4 bg-zinc-100 dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-zinc-400/50 focus:border-zinc-500 text-sm transition-all"
            />
            <button
              type="submit"
              disabled={!inputValue.trim()}
              className="p-3 sm:p-4 bg-zinc-900 dark:bg-white text-white dark:text-black rounded-xl hover:opacity-90 transition-all disabled:opacity-50 shadow-lg flex items-center justify-center shrink-0 active:scale-90"
            >
              <Send className="w-4 h-4 sm:w-5 sm:h-5" />
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
