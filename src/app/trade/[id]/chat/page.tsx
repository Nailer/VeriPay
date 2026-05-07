"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, ShieldCheck, Send, User, Lock, CheckCheck } from "lucide-react";

export default function ChatPage() {
  const params = useParams();
  const idStr = params?.id as string;
  
  const [inputValue, setInputValue] = useState("");
  const [messages, setMessages] = useState([
    {
      id: 1,
      sender: "Admin",
      text: "Welcome to the secure resolution channel for Trade #00" + idStr + ". How can we assist you today?",
      time: "10:00 AM",
      isAdmin: true,
      isMe: false,
    },
    {
      id: 2,
      sender: "Buyer",
      text: "Hello, I haven't received the digital asset yet. The seller said they sent it.",
      time: "10:05 AM",
      isAdmin: false,
      isMe: true,
    },
    {
      id: 3,
      sender: "Seller",
      text: "I sent it to the wallet address provided in the metadata. Can you please check again?",
      time: "10:12 AM",
      isAdmin: false,
      isMe: false,
    }
  ]);

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputValue.trim()) return;
    
    setMessages([...messages, {
      id: Date.now(),
      sender: "Buyer",
      text: inputValue,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      isAdmin: false,
      isMe: true,
    }]);
    setInputValue("");
  };

  return (
    <div className="flex-1 flex flex-col items-center py-8 px-4 sm:px-6 relative z-10 w-full max-w-4xl mx-auto transition-colors duration-300 min-h-[80vh]">
      
      {/* Top Navigation */}
      <div className="w-full mb-6 flex items-center justify-between">
        <Link href={`/trade/${idStr}`} className="inline-flex items-center gap-2 text-zinc-600 dark:text-zinc-500 hover:text-zinc-900 dark:hover:text-white transition-colors font-bold uppercase tracking-widest text-[10px]">
          <ArrowLeft className="w-4 h-4" /> Back to Trade
        </Link>
        <div className="flex items-center gap-2 px-3 py-1 bg-green-100 dark:bg-green-500/10 border border-green-200 dark:border-green-500/20 rounded-full">
          <ShieldCheck className="w-3 h-3 text-green-600 dark:text-green-400" />
          <span className="text-[10px] font-black text-green-700 dark:text-green-400 uppercase tracking-widest">End-to-End Encrypted</span>
        </div>
      </div>

      {/* Encryption Banner */}
      <div className="w-full mb-6 p-4 rounded-2xl bg-zinc-100 dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-800 flex items-start gap-4 transition-colors">
        <div className="p-2 bg-zinc-200 dark:bg-zinc-700 rounded-full mt-1">
          <Lock className="w-4 h-4 text-zinc-600 dark:text-zinc-300" />
        </div>
        <div>
          <h4 className="text-sm font-bold text-zinc-900 dark:text-white">Secure Resolution Channel</h4>
          <p className="text-xs text-zinc-600 dark:text-zinc-400 mt-1 leading-relaxed">
            Your chat is fully encrypted. Both parties are present in this channel along with a Monad Pay Admin to safely resolve your dispute. Do not share your private keys.
          </p>
        </div>
      </div>

      {/* Chat Interface */}
      <div className="w-full flex-1 flex flex-col bg-white dark:bg-zinc-900/40 border border-zinc-200 dark:border-zinc-800 rounded-[2rem] overflow-hidden shadow-2xl relative">
        
        {/* Chat Header */}
        <div className="p-6 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between bg-zinc-50 dark:bg-zinc-900/80">
          <div>
            <h3 className="text-lg font-black text-zinc-900 dark:text-white">Dispute Resolution</h3>
            <p className="text-xs text-zinc-500 uppercase tracking-widest mt-1 font-bold">Trade #00{idStr}</p>
          </div>
          <div className="flex -space-x-2">
            <div className="w-8 h-8 rounded-full border-2 border-white dark:border-zinc-900 bg-[#FF007A] flex items-center justify-center text-[10px] font-bold text-white z-20">A</div>
            <div className="w-8 h-8 rounded-full border-2 border-white dark:border-zinc-900 bg-blue-500 flex items-center justify-center text-[10px] font-bold text-white z-10">B</div>
            <div className="w-8 h-8 rounded-full border-2 border-white dark:border-zinc-900 bg-zinc-800 flex items-center justify-center text-[10px] font-bold text-white">S</div>
          </div>
        </div>

        {/* Chat Messages */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6 bg-zinc-50/50 dark:bg-transparent flex flex-col">
          {messages.map((msg) => (
            <div key={msg.id} className={`flex w-full ${msg.isMe ? 'justify-end' : 'justify-start'}`}>
              <div className={`flex flex-col max-w-[80%] ${msg.isMe ? 'items-end' : 'items-start'}`}>
                
                {!msg.isMe && (
                  <div className="flex items-center gap-2 mb-1 pl-1">
                    {msg.isAdmin ? (
                      <span className="text-[10px] font-black uppercase tracking-widest text-[#FF007A]">Admin</span>
                    ) : (
                      <span className="text-[10px] font-black uppercase tracking-widest text-zinc-500">{msg.sender}</span>
                    )}
                  </div>
                )}
                
                <div className={`px-5 py-3 rounded-2xl text-sm leading-relaxed ${
                  msg.isAdmin 
                    ? 'bg-zinc-200 dark:bg-zinc-800 text-zinc-900 dark:text-white rounded-tl-sm' 
                    : msg.isMe 
                      ? 'bg-[#FF007A] text-white rounded-tr-sm shadow-md shadow-pink-500/20' 
                      : 'bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-zinc-900 dark:text-white rounded-tl-sm shadow-sm'
                }`}>
                  {msg.text}
                </div>
                
                <div className="flex items-center gap-1 mt-1 pr-1 text-[10px] font-medium text-zinc-400">
                  {msg.time}
                  {msg.isMe && <CheckCheck className="w-3 h-3 text-[#FF007A]" />}
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Coming Soon Indicator - Bottom Right Overlay */}
        <div className="absolute bottom-24 right-6 bg-yellow-400/90 dark:bg-yellow-500/90 text-black px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest animate-pulse shadow-lg backdrop-blur-sm border border-yellow-300">
          This Feature is Coming Soon
        </div>

        {/* Chat Input */}
        <div className="p-4 border-t border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900">
          <form onSubmit={handleSend} className="flex items-center gap-3 relative">
            <div className="flex-1 relative">
              <input 
                type="text" 
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                placeholder="Type your message securely..." 
                className="w-full pl-5 pr-12 py-4 bg-zinc-100 dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#FF007A]/50 focus:border-[#FF007A]/50 text-sm transition-all"
              />
            </div>
            <button 
              type="submit"
              disabled={!inputValue.trim()}
              className="p-4 bg-[#FF007A] text-white rounded-xl hover:bg-pink-600 transition-colors disabled:opacity-50 disabled:hover:bg-[#FF007A] shadow-lg shadow-pink-500/20 flex items-center justify-center"
            >
              <Send className="w-5 h-5" />
            </button>
          </form>
        </div>
        
      </div>
    </div>
  );
}
