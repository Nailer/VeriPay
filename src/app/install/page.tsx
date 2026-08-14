"use client";

import { Share, PlusSquare, MoreVertical, Download, Smartphone, Monitor, Bell, Check } from "lucide-react";

function Step({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-4">
      <span className="shrink-0 w-7 h-7 rounded-full bg-zinc-900 dark:bg-white text-white dark:text-black text-xs font-black flex items-center justify-center mt-0.5">
        {n}
      </span>
      <p className="text-sm sm:text-base text-zinc-700 dark:text-zinc-300 leading-relaxed pt-0.5">{children}</p>
    </li>
  );
}

function Card({
  icon, title, children,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-3xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 p-6 sm:p-8">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-2xl bg-zinc-100 dark:bg-zinc-900 flex items-center justify-center">
          {icon}
        </div>
        <h2 className="text-lg font-black uppercase tracking-wide text-zinc-900 dark:text-white">{title}</h2>
      </div>
      <ol className="flex flex-col gap-4">{children}</ol>
    </div>
  );
}

export default function InstallPage() {
  return (
    <div className="flex flex-col min-h-screen relative overflow-hidden transition-colors duration-300">
      <div className="bg-ambient absolute top-0 inset-x-0 h-full overflow-hidden pointer-events-none -z-10" />

      <main className="flex-1 px-5 py-14 sm:py-20 w-full max-w-3xl mx-auto z-10">
        <div className="text-center mb-12">
          <div className="inline-flex items-center justify-center px-3 py-1.5 mb-5 rounded-full border border-zinc-200 dark:border-white/20 bg-zinc-100/50 dark:bg-white/5 text-zinc-600 dark:text-zinc-300 text-xs font-medium backdrop-blur-md">
            <Download className="w-3.5 h-3.5 mr-1.5" /> Not on an app store — install it directly
          </div>
          <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight mb-4 text-zinc-900 dark:text-white">
            Install VeriPay on your device
          </h1>
          <p className="text-sm sm:text-base text-zinc-600 dark:text-zinc-400 max-w-lg mx-auto leading-relaxed">
            VeriPay isn&apos;t distributed through the Play Store or App Store. It installs straight
            from the website — same app, real icon, opens full-screen, and can send you real
            notifications, all in under a minute.
          </p>
        </div>

        <div className="flex flex-col gap-6">
          <Card icon={<Share className="w-5 h-5 text-zinc-900 dark:text-white" />} title="iPhone / iPad (Safari)">
            <Step n={1}>Open <span className="font-mono text-xs bg-zinc-100 dark:bg-zinc-900 px-1.5 py-0.5 rounded">veripay.store</span> in Safari — this only works in Safari, not Chrome or Instagram&apos;s browser.</Step>
            <Step n={2}>Tap the <Share className="inline w-4 h-4 -mt-0.5" /> Share icon in the bottom toolbar.</Step>
            <Step n={3}>Scroll down and tap <PlusSquare className="inline w-4 h-4 -mt-0.5" /> <strong>&ldquo;Add to Home Screen.&rdquo;</strong></Step>
            <Step n={4}>Tap <strong>Add</strong> in the top-right corner. The VeriPay icon appears on your home screen.</Step>
          </Card>

          <Card icon={<Smartphone className="w-5 h-5 text-zinc-900 dark:text-white" />} title="Android (Chrome)">
            <Step n={1}>Open <span className="font-mono text-xs bg-zinc-100 dark:bg-zinc-900 px-1.5 py-0.5 rounded">veripay.store</span> in Chrome.</Step>
            <Step n={2}>Tap <strong>&ldquo;Install app&rdquo;</strong> if a banner appears — or tap the <MoreVertical className="inline w-4 h-4 -mt-0.5" /> menu in the top-right and choose <strong>&ldquo;Install app.&rdquo;</strong></Step>
            <Step n={3}>Confirm. VeriPay installs like any other app, with its own icon and app-switcher entry.</Step>
          </Card>

          <Card icon={<Monitor className="w-5 h-5 text-zinc-900 dark:text-white" />} title="Desktop (Chrome / Edge)">
            <Step n={1}>Open <span className="font-mono text-xs bg-zinc-100 dark:bg-zinc-900 px-1.5 py-0.5 rounded">veripay.store</span>.</Step>
            <Step n={2}>Click the install icon at the right edge of the address bar (or the <MoreVertical className="inline w-4 h-4 -mt-0.5" /> menu → <strong>&ldquo;Install VeriPay…&rdquo;</strong>).</Step>
            <Step n={3}>VeriPay opens in its own window, separate from your browser tabs.</Step>
          </Card>

          <div className="rounded-3xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/50 p-6 sm:p-8 flex items-start gap-4">
            <div className="w-10 h-10 rounded-2xl bg-zinc-100 dark:bg-zinc-900 flex items-center justify-center shrink-0">
              <Bell className="w-5 h-5 text-zinc-900 dark:text-white" />
            </div>
            <div>
              <h3 className="text-sm font-black uppercase tracking-wide text-zinc-900 dark:text-white mb-1.5">
                Turn on real alerts
              </h3>
              <p className="text-sm text-zinc-600 dark:text-zinc-400 leading-relaxed">
                Once installed, connect your wallet and open the notification bell in the top bar —
                &ldquo;Enable Device Alerts&rdquo; turns trade and chat updates into real notifications
                on this device, even when VeriPay isn&apos;t open.
              </p>
            </div>
          </div>

          <div className="flex items-center justify-center gap-2 text-xs text-zinc-400 font-medium">
            <Check className="w-3.5 h-3.5" /> No download size, no store review, no update prompts — it&apos;s just the website, installed.
          </div>
        </div>
      </main>
    </div>
  );
}
