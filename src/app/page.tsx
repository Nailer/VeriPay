import Link from "next/link";
import { CONTRACT_ADDRESS } from "@/lib/abi";
import { ArrowRight, ShieldCheck, Zap, Lock, Wallet } from "lucide-react";

export default function Home() {
  return (
    <div className="flex flex-col min-h-screen relative overflow-hidden transition-colors duration-300">
      {/* Background gradients */}
      <div className="bg-ambient absolute top-0 inset-x-0 h-full overflow-hidden pointer-events-none -z-10" />

      {/* Hero Section */}
      <main className="flex-1 flex flex-col items-center justify-center text-center px-5 py-16 sm:py-24 md:py-32 w-full max-w-5xl mx-auto z-10">
        {/* Live badge */}
        <div className="inline-flex items-center justify-center px-3 py-1.5 mb-6 sm:mb-8 rounded-full border border-zinc-200 dark:border-white/20 bg-zinc-100/50 dark:bg-white/5 text-zinc-600 dark:text-zinc-300 text-xs sm:text-sm font-medium backdrop-blur-md">
          <span className="relative flex h-2 w-2 mr-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-zinc-500 dark:bg-zinc-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-zinc-800 dark:bg-white"></span>
          </span>
          Next-Generation Escrow Protocol
        </div>

        <h1 className="text-4xl sm:text-5xl md:text-7xl font-extrabold tracking-tight mb-6 sm:mb-8 leading-[1.1] text-zinc-900 dark:text-white transition-colors">
          Trustless transactions{" "}
          <br className="hidden sm:block" />
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-zinc-900 via-zinc-600 to-zinc-400 dark:from-white dark:via-zinc-400 dark:to-zinc-600">
            secured with honesty.
          </span>
        </h1>

        <p className="text-base sm:text-lg md:text-xl text-zinc-600 dark:text-zinc-400 max-w-2xl mb-10 sm:mb-12 leading-relaxed transition-colors px-2">
          VeriPay provides a completely decentralized, fast, and transparent escrow service.
          Funds are securely locked in smart contracts until both parties are 100% satisfied.
        </p>

        <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 w-full max-w-sm sm:max-w-none justify-center">
          <Link
            href="/create"
            className="flex items-center justify-center gap-2 px-7 py-4 rounded-full bg-zinc-900 dark:bg-white text-white dark:text-black font-semibold hover:bg-zinc-800 dark:hover:bg-zinc-200 transition-colors shadow-[0_0_40px_rgba(0,0,0,0.1)] dark:shadow-[0_0_40px_rgba(255,255,255,0.1)] text-sm sm:text-base"
          >
            Start Escrow
            <ArrowRight className="w-4 h-4 sm:w-5 sm:h-5" />
          </Link>
          <Link
            href="/dashboard"
            className="flex items-center justify-center gap-2 px-7 py-4 rounded-full bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-zinc-900 dark:text-white font-medium hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors text-sm sm:text-base"
          >
            View Trades Dashboard
          </Link>
        </div>

        {/* No MON? → Exchange */}
        <Link
          href="/exchange"
          className="group mt-8 sm:mt-10 inline-flex items-center gap-3 px-5 py-3 rounded-full bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 hover:border-zinc-400 dark:hover:border-zinc-500 transition-all duration-500 hover:-translate-y-0.5"
        >
          <Wallet className="w-4 h-4 text-zinc-900 dark:text-white" />
          <span className="text-xs sm:text-sm font-bold text-zinc-800 dark:text-zinc-200">
            No MON yet? <span className="underline underline-offset-2">Buy with Naira</span> in two taps
          </span>
          <ArrowRight className="w-4 h-4 text-zinc-900 dark:text-white group-hover:translate-x-1 transition-transform duration-300" />
        </Link>
      </main>

      {/* Features Section */}
      <section className="py-16 sm:py-24 px-5 sm:px-6 relative z-10 border-t border-zinc-200 dark:border-zinc-900 bg-white/40 dark:bg-black/40 backdrop-blur-sm transition-colors">
        <div className="max-w-6xl mx-auto grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-5 sm:gap-8">

          <div className="group p-6 sm:p-8 rounded-3xl bg-zinc-50 dark:bg-zinc-900/50 border border-zinc-200 dark:border-zinc-800/80 hover:border-zinc-300 dark:hover:border-white/50 transition-all duration-500 hover:-translate-y-1 hover:bg-zinc-100 dark:hover:bg-zinc-900/80">
            <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-2xl bg-zinc-200/50 dark:bg-white/5 border border-zinc-300/50 dark:border-white/10 flex items-center justify-center mb-5 sm:mb-6 group-hover:scale-110 transition-transform duration-500">
              <ShieldCheck className="w-6 h-6 sm:w-7 sm:h-7 text-zinc-900 dark:text-white" />
            </div>
            <h3 className="text-lg sm:text-xl font-bold text-zinc-900 dark:text-white mb-2 sm:mb-3 transition-colors">Check the seller first</h3>
            <p className="text-sm sm:text-base text-zinc-600 dark:text-zinc-400 leading-relaxed transition-colors">
              Paste any vendor&apos;s wallet and see every trade they&apos;ve done here — paid out, disputed, refunded. It&apos;s read straight from Monad, so nobody can fake it. Not even us.
            </p>
            <Link href="/seller" className="mt-4 inline-flex items-center gap-1 text-sm font-bold text-zinc-900 dark:text-white hover:underline underline-offset-4">Check a seller <ArrowRight className="w-4 h-4" /></Link>
          </div>
          <div className="group p-6 sm:p-8 rounded-3xl bg-zinc-50 dark:bg-zinc-900/50 border border-zinc-200 dark:border-zinc-800/80 hover:border-zinc-300 dark:hover:border-white/50 transition-all duration-500 hover:-translate-y-1 hover:bg-zinc-100 dark:hover:bg-zinc-900/80">
            <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-2xl bg-zinc-200/50 dark:bg-white/5 border border-zinc-300/50 dark:border-white/10 flex items-center justify-center mb-5 sm:mb-6 group-hover:scale-110 transition-transform duration-500">
              <Lock className="w-6 h-6 sm:w-7 sm:h-7 text-zinc-900 dark:text-white" />
            </div>
            <h3 className="text-lg sm:text-xl font-bold text-zinc-900 dark:text-white mb-2 sm:mb-3 transition-colors">Pay in dollars</h3>
            <p className="text-sm sm:text-base text-zinc-600 dark:text-zinc-400 leading-relaxed transition-colors">
              Lock your payment in AUSD, a dollar-backed stablecoin, so the amount you agreed on is the amount the seller gets — no price swings while you wait for delivery.
            </p>
          </div>
          <div className="group p-6 sm:p-8 rounded-3xl bg-zinc-50 dark:bg-zinc-900/50 border border-zinc-200 dark:border-zinc-800/80 hover:border-zinc-300 dark:hover:border-white/50 transition-all duration-500 hover:-translate-y-1 hover:bg-zinc-100 dark:hover:bg-zinc-900/80 sm:col-span-2 md:col-span-1">
            <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-2xl bg-zinc-200/50 dark:bg-white/5 border border-zinc-300/50 dark:border-white/10 flex items-center justify-center mb-5 sm:mb-6 group-hover:scale-110 transition-transform duration-500">
              <Zap className="w-6 h-6 sm:w-7 sm:h-7 text-zinc-900 dark:text-white" />
            </div>
            <h3 className="text-lg sm:text-xl font-bold text-zinc-900 dark:text-white mb-2 sm:mb-3 transition-colors">Never stuck waiting</h3>
            <p className="text-sm sm:text-base text-zinc-600 dark:text-zinc-400 leading-relaxed transition-colors">
              If a buyer goes quiet after delivery, the seller is paid automatically once the 7-day window passes. No one has to remember to press a button.
            </p>
          </div>

        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-zinc-200 dark:border-zinc-900 py-8 sm:py-12 px-5 sm:px-6 flex flex-col md:flex-row items-center justify-between gap-4 text-zinc-500 text-xs sm:text-sm max-w-6xl mx-auto w-full relative z-10 transition-colors">
        <p>© 2026 VeriPay. All rights reserved.</p>
        <div className="flex gap-4 sm:gap-6">
          <Link href="/install" className="hover:text-zinc-900 dark:hover:text-white transition-colors">Install App</Link>
          <a href="https://www.coinapi.io/learn/glossary/escrow-service" className="hover:text-zinc-900 dark:hover:text-white transition-colors">Terms of Service</a>
          <a href={`https://testnet.monadscan.com/address/${CONTRACT_ADDRESS}`} className="hover:text-zinc-900 dark:hover:text-white transition-colors">Smart Contracts</a>
        </div>
      </footer>
    </div>
  );
}
