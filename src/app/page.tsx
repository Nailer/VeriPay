import Link from "next/link";
import { ArrowRight, ShieldCheck, Zap, Lock } from "lucide-react";

export default function Home() {
  return (
    <div className="flex flex-col min-h-screen relative overflow-hidden transition-colors duration-300">
      {/* Background gradients */}
      <div className="absolute top-0 inset-x-0 h-full overflow-hidden pointer-events-none -z-10">
        <div className="absolute -top-[30%] -right-[10%] w-[70%] h-[70%] rounded-full bg-zinc-200/50 dark:bg-zinc-800/30 blur-[120px] mix-blend-multiply dark:mix-blend-screen animate-pulse" />
        <div className="absolute top-[20%] -left-[10%] w-[50%] h-[50%] rounded-full bg-zinc-300/50 dark:bg-zinc-900/40 blur-[100px] mix-blend-multiply dark:mix-blend-screen" />
      </div>

      {/* Hero Section */}
      <main className="flex-1 flex flex-col items-center justify-center text-center px-4 py-24 md:py-32 w-full max-w-5xl mx-auto z-10">
        <div className="inline-flex items-center justify-center px-4 py-1.5 mb-8 rounded-full border border-zinc-200 dark:border-white/20 bg-zinc-100/50 dark:bg-white/5 text-zinc-600 dark:text-zinc-300 text-sm font-medium backdrop-blur-md">
          <span className="relative flex h-2 w-2 mr-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-zinc-500 dark:bg-zinc-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-zinc-800 dark:bg-white"></span>
          </span>
          Next-Generation Escrow Protocol
        </div>
        
        <h1 className="text-5xl md:text-7xl font-extrabold tracking-tight mb-8 leading-tight text-zinc-900 dark:text-white transition-colors">
          Trustless transactions <br className="hidden md:block" />
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-zinc-900 via-zinc-600 to-zinc-400 dark:from-white dark:via-zinc-400 dark:to-zinc-600">
            secured by math.
          </span>
        </h1>
        
        <p className="text-lg md:text-xl text-zinc-600 dark:text-zinc-400 max-w-2xl mb-12 leading-relaxed transition-colors">
          Monad Pay provides a completely decentralized, fast, and transparent escrow service. 
          Funds are securely locked in smart contracts until both parties are 100% satisfied.
        </p>

        <div className="flex flex-col sm:flex-row gap-4 w-full justify-center">
          <Link href="/create" className="flex items-center justify-center gap-2 px-8 py-4 rounded-full bg-zinc-900 dark:bg-white text-white dark:text-black font-semibold hover:bg-zinc-800 dark:hover:bg-zinc-200 transition-colors shadow-[0_0_40px_rgba(0,0,0,0.1)] dark:shadow-[0_0_40px_rgba(255,255,255,0.1)]">
            Start Escrow
            <ArrowRight className="w-5 h-5" />
          </Link>
          <Link href="/dashboard" className="flex items-center justify-center gap-2 px-8 py-4 rounded-full bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-zinc-900 dark:text-white font-medium hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors">
            View Trades Dashboard
          </Link>
        </div>
      </main>

      {/* Features Section */}
      <section className="py-24 px-6 relative z-10 border-t border-zinc-200 dark:border-zinc-900 bg-white/40 dark:bg-black/40 backdrop-blur-sm transition-colors">
        <div className="max-w-6xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-8">
          
          <div className="group p-8 rounded-3xl bg-zinc-50 dark:bg-zinc-900/50 border border-zinc-200 dark:border-zinc-800/80 hover:border-zinc-300 dark:hover:border-white/50 transition-all duration-500 hover:-translate-y-1 hover:bg-zinc-100 dark:hover:bg-zinc-900/80">
            <div className="w-14 h-14 rounded-2xl bg-zinc-200/50 dark:bg-white/5 border border-zinc-300/50 dark:border-white/10 flex items-center justify-center mb-6 group-hover:scale-110 transition-transform duration-500">
              <ShieldCheck className="w-7 h-7 text-zinc-900 dark:text-white" />
            </div>
            <h3 className="text-xl font-bold text-zinc-900 dark:text-white mb-3 transition-colors">Military-Grade Security</h3>
            <p className="text-zinc-600 dark:text-zinc-400 leading-relaxed transition-colors">
              Our smart contracts are heavily audited and immutable. Your funds are never touched by humans and only released upon cryptographic proof of agreement.
            </p>
          </div>

          <div className="group p-8 rounded-3xl bg-zinc-50 dark:bg-zinc-900/50 border border-zinc-200 dark:border-zinc-800/80 hover:border-zinc-300 dark:hover:border-white/50 transition-all duration-500 hover:-translate-y-1 hover:bg-zinc-100 dark:hover:bg-zinc-900/80">
            <div className="w-14 h-14 rounded-2xl bg-zinc-200/50 dark:bg-white/5 border border-zinc-300/50 dark:border-white/10 flex items-center justify-center mb-6 group-hover:scale-110 transition-transform duration-500">
              <Zap className="w-7 h-7 text-zinc-900 dark:text-white" />
            </div>
            <h3 className="text-xl font-bold text-zinc-900 dark:text-white mb-3 transition-colors">Lightning Fast</h3>
            <p className="text-zinc-600 dark:text-zinc-400 leading-relaxed transition-colors">
              Powered by Monad's high-throughput parallel execution, your escrow transactions resolve in milliseconds with essentially zero network latency.
            </p>
          </div>

          <div className="group p-8 rounded-3xl bg-zinc-50 dark:bg-zinc-900/50 border border-zinc-200 dark:border-zinc-800/80 hover:border-zinc-300 dark:hover:border-white/50 transition-all duration-500 hover:-translate-y-1 hover:bg-zinc-100 dark:hover:bg-zinc-900/80">
            <div className="w-14 h-14 rounded-2xl bg-zinc-200/50 dark:bg-white/5 border border-zinc-300/50 dark:border-white/10 flex items-center justify-center mb-6 group-hover:scale-110 transition-transform duration-500">
              <Lock className="w-7 h-7 text-zinc-900 dark:text-white" />
            </div>
            <h3 className="text-xl font-bold text-zinc-900 dark:text-white mb-3 transition-colors">Total Transparency</h3>
            <p className="text-zinc-600 dark:text-zinc-400 leading-relaxed transition-colors">
              Every step of the escrow lifecycle is fully verifiable on-chain. There are no black boxes or hidden fees—what you see in the contract is what you get.
            </p>
          </div>

        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-zinc-200 dark:border-zinc-900 py-12 px-6 flex flex-col md:flex-row items-center justify-between text-zinc-500 text-sm max-w-6xl mx-auto w-full relative z-10 transition-colors">
        <p>© 2026 Monad Pay. All rights reserved.</p>
        <div className="flex gap-6 mt-4 md:mt-0">
          <a href="#" className="hover:text-zinc-900 dark:hover:text-white transition-colors">Terms of Service</a>
          <a href="#" className="hover:text-zinc-900 dark:hover:text-white transition-colors">Privacy Policy</a>
          <a href="#" className="hover:text-zinc-900 dark:hover:text-white transition-colors">Smart Contracts</a>
        </div>
      </footer>
    </div>
  );
}
