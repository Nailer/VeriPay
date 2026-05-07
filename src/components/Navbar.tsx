"use client";

import { ConnectButton } from "thirdweb/react";
import { client } from "@/app/client";
import { defineChain } from "thirdweb";
import Link from "next/link";
import { useTheme } from "next-themes";
import { Sun, Moon, Monitor, Plus } from "lucide-react";
import { useState, useEffect } from "react";

export default function Navbar() {
  const { theme, setTheme, resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const isDark = resolvedTheme === "dark";

  return (
    <header className="flex items-center justify-between px-6 py-4 md:px-12 backdrop-blur-md border-b border-zinc-200 dark:border-white/10 sticky top-0 z-50 bg-white/80 dark:bg-black/80 transition-all duration-300">
      <Link href="/" className="flex items-center gap-3 cursor-pointer group hover:opacity-80">
        <div className="w-10 h-10 rounded-xl bg-black dark:bg-white flex items-center justify-center shadow-lg shadow-black/10 dark:shadow-white/10 group-hover:shadow-black/30 dark:group-hover:shadow-white/30 transition-shadow">
          <span className="font-bold text-white dark:text-black text-xl tracking-tighter">MP</span>
        </div>
        <span className="text-xl font-bold tracking-tight text-zinc-900 dark:text-white hidden sm:block">
          Monad Pay
        </span>
      </Link>
      <div className="flex items-center gap-4 sm:gap-6">
        <Link href="/dashboard" className="text-sm font-medium text-zinc-600 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-white transition-colors">
          Dashboard
        </Link>
        <Link href="/create" className="text-sm font-medium text-zinc-600 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-white transition-colors hidden sm:block">
          New Escrow
        </Link>

        {mounted && (
          <div className="relative group hidden sm:block">
            <button className="flex items-center justify-center w-9 h-9 rounded-full bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-800 transition-colors focus:outline-none">
              {theme === "light" && <Sun className="w-4 h-4" />}
              {theme === "dark" && <Moon className="w-4 h-4" />}
              {theme === "system" && <Monitor className="w-4 h-4" />}
            </button>
            <div className="absolute right-0 top-full mt-2 opacity-0 invisible group-hover:opacity-100 group-hover:visible translate-y-2 group-hover:translate-y-0 transition-all duration-200 flex flex-col bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl overflow-hidden shadow-xl w-36 py-1 z-50">
              <button onClick={() => setTheme("light")} className={`flex items-center gap-3 px-4 py-2.5 text-sm transition-colors ${theme === "light" ? "text-black dark:text-white bg-zinc-100 dark:bg-zinc-800/50" : "text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800"}`}>
                <Sun className="w-4 h-4" /> Light
              </button>
              <button onClick={() => setTheme("dark")} className={`flex items-center gap-3 px-4 py-2.5 text-sm transition-colors ${theme === "dark" ? "text-black dark:text-white bg-zinc-100 dark:bg-zinc-800/50" : "text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800"}`}>
                <Moon className="w-4 h-4" /> Dark
              </button>
              <button onClick={() => setTheme("system")} className={`flex items-center gap-3 px-4 py-2.5 text-sm transition-colors ${theme === "system" ? "text-black dark:text-white bg-zinc-100 dark:bg-zinc-800/50" : "text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800"}`}>
                <Monitor className="w-4 h-4" /> System
              </button>
            </div>
          </div>
        )}

        <div className="flex items-center gap-2">
          <ConnectButton 
            client={client} 
            theme={mounted && isDark ? "dark" : "light"}
            connectModal={{ size: "wide" }}
            chain={defineChain(10143)}
          />
          <button className="hidden sm:flex flex-col items-center justify-center gap-0.5 px-2 py-2.5 min-w-[3rem] bg-transparent border border-zinc-200 dark:border-zinc-800 rounded-xl hover:bg-zinc-50 dark:hover:bg-zinc-900 transition-colors cursor-not-allowed">
            <Plus className="w-4 h-4 text-zinc-500 dark:text-zinc-400" />
            <span className="text-[8px] font-black uppercase tracking-widest text-zinc-500 dark:text-zinc-400 leading-none">Soon</span>
          </button>
        </div>
      </div>
    </header>
  );
}
