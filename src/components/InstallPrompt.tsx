"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { Download, X, Share } from "lucide-react";

const DISMISS_KEY = "veripay-install-dismissed";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (window.navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

function isIOS(): boolean {
  if (typeof navigator === "undefined") return false;
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

// Slim, dismissible banner nudging visitors to install VeriPay as an app.
// This isn't a Play Store / App Store listing — it's the site itself,
// installed, so the prompt has to teach the mechanism (native install
// prompt on Android/Chrome, Share -> Add to Home Screen on iOS Safari).
export default function InstallPrompt() {
  const [visible, setVisible] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [ios, setIos] = useState(false);

  useEffect(() => {
    if (isStandalone() || localStorage.getItem(DISMISS_KEY)) return;
    setIos(isIOS());

    const onBeforeInstall = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      setVisible(true);
    };
    window.addEventListener("beforeinstallprompt", onBeforeInstall);

    // iOS never fires beforeinstallprompt — show the banner unconditionally there.
    if (isIOS()) {
      const t = setTimeout(() => setVisible(true), 1500);
      return () => { clearTimeout(t); window.removeEventListener("beforeinstallprompt", onBeforeInstall); };
    }

    return () => window.removeEventListener("beforeinstallprompt", onBeforeInstall);
  }, []);

  const dismiss = useCallback(() => {
    localStorage.setItem(DISMISS_KEY, "1");
    setVisible(false);
  }, []);

  const install = useCallback(async () => {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    setDeferredPrompt(null);
    dismiss();
  }, [deferredPrompt, dismiss]);

  if (!visible) return null;

  return (
    <div className="relative z-40 bg-zinc-900 dark:bg-white text-white dark:text-black">
      <div className="max-w-6xl mx-auto px-4 py-2.5 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          {ios ? <Share className="w-4 h-4 shrink-0" /> : <Download className="w-4 h-4 shrink-0" />}
          <p className="text-xs font-bold truncate">
            {ios
              ? "Install VeriPay: tap Share, then “Add to Home Screen”."
              : "Install VeriPay for faster access and real alerts."}
          </p>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          {ios ? (
            <Link href="/install" onClick={dismiss} className="text-xs font-black uppercase tracking-widest underline underline-offset-2">
              How
            </Link>
          ) : deferredPrompt ? (
            <button onClick={install} className="text-xs font-black uppercase tracking-widest underline underline-offset-2">
              Install
            </button>
          ) : (
            <Link href="/install" onClick={dismiss} className="text-xs font-black uppercase tracking-widest underline underline-offset-2">
              How
            </Link>
          )}
          <button onClick={dismiss} aria-label="Dismiss" className="opacity-70 hover:opacity-100 transition-opacity">
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
