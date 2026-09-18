"use client";

import { ConnectButton } from "thirdweb/react";
import { client } from "@/app/client";
import { defineChain } from "thirdweb";
import { createWallet, inAppWallet } from "thirdweb/wallets";
import Link from "next/link";
import { useTheme } from "next-themes";
import {
  Sun, Moon, Monitor, Bell, BellOff, BellRing, ShieldCheck, MessageSquare,
  X, Check, Menu, Fingerprint, Loader2,
} from "lucide-react";
import { useState, useEffect, useRef, useCallback } from "react";
import { useActiveAccount, useSetActiveWallet } from "thirdweb/react";
import Logo from "@/components/Logo";
import { usePolling } from "@/lib/usePolling";
import { isPushSupported, getExistingSubscription, subscribeToPush, unsubscribeFromPush } from "@/lib/pushClient";
import { isPasskeySupported, connectWithPasskey, friendlyPasskeyError } from "@/lib/mera";

type Notification = {
  id: number;
  type: "trade" | "chat";
  tradeId: string;
  fromAddress: string;
  amount?: string;
  message?: string;
  read: boolean;
  createdAt: string;
};

const wallets = [
  inAppWallet({ auth: { options: ["email", "google", "apple", "facebook", "phone"] } }),
  createWallet("io.metamask"),
  createWallet("walletConnect"),
  createWallet("com.coinbase.wallet"),
  createWallet("me.rainbow"),
  createWallet("com.walletconnect"),
  createWallet("io.rabby"),
  createWallet("io.zerion.wallet"),
];

// Compact styling for the thirdweb connect button so the mobile header stays slim
const compactConnectStyle = {
  height: "36px",
  minWidth: "0",
  fontSize: "13px",
  fontWeight: "700",
  padding: "0 14px",
  borderRadius: "9999px",
} as const;

export default function Navbar() {
  const { theme, setTheme, resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const account = useActiveAccount();
  const setActiveWallet = useSetActiveWallet();

  // ─── Passkey sign-in (Mera) ───────────────────────────────────────────────
  const [passkeyBusy, setPasskeyBusy] = useState(false);
  const [passkeyError, setPasskeyError] = useState<string | null>(null);
  const passkeySupported = mounted && isPasskeySupported();

  const handlePasskeySignIn = useCallback(async () => {
    setPasskeyBusy(true);
    setPasskeyError(null);
    try {
      const wallet = await connectWithPasskey();
      await wallet.connect({ client } as Parameters<typeof wallet.connect>[0]);
      await setActiveWallet(wallet);
    } catch (err) {
      setPasskeyError(friendlyPasskeyError(err));
    } finally {
      setPasskeyBusy(false);
    }
  }, [setActiveWallet]);

  // ─── Mobile menu ─────────────────────────────────────────────────────────
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // ─── Notification state ──────────────────────────────────────────────────
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [panelOpen, setPanelOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const bellRef = useRef<HTMLButtonElement>(null);

  const unreadCount = notifications.filter((n) => !n.read).length;

  // ─── Push notification opt-in ────────────────────────────────────────────
  // "on" | "off" | "denied" | "unsupported" | "checking"
  const [pushState, setPushState] = useState<"on" | "off" | "denied" | "unsupported" | "checking">("checking");

  useEffect(() => {
    if (!isPushSupported()) { setPushState("unsupported"); return; }
    if (Notification.permission === "denied") { setPushState("denied"); return; }
    getExistingSubscription()
      .then((sub) => setPushState(sub ? "on" : "off"))
      .catch(() => setPushState("off"));
  }, []);

  const togglePush = useCallback(async () => {
    if (pushState === "on") {
      await unsubscribeFromPush();
      setPushState("off");
      return;
    }
    if (!account?.address) return;
    const result = await subscribeToPush(account.address);
    setPushState(result === "subscribed" ? "on" : result === "denied" ? "denied" : "unsupported");
  }, [pushState, account?.address]);

  const fetchNotifications = useCallback(async () => {
    if (!account?.address) return;
    try {
      const res = await fetch(`/api/notifications?address=${account.address}`);
      if (res.ok) {
        const data = await res.json();
        setNotifications(data.notifications ?? []);
      }
    } catch { /* silent */ }
  }, [account?.address]);

  // Alerts aren't time-critical, and this runs on every page for every visitor,
  // so poll at a relaxed cadence and only while the tab is visible.
  usePolling(fetchNotifications, 20_000, Boolean(account?.address));

  // Close notification panel on outside click
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (
        panelRef.current && !panelRef.current.contains(e.target as Node) &&
        bellRef.current && !bellRef.current.contains(e.target as Node)
      ) {
        setPanelOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  // Close mobile menu on route change / resize
  useEffect(() => {
    const handleResize = () => { if (window.innerWidth >= 640) setMobileMenuOpen(false); };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const markAllRead = async () => {
    if (!account?.address || notifications.length === 0) return;
    try {
      await fetch("/api/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address: account.address }),
      });
      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    } catch { /* silent */ }
  };

  useEffect(() => { setMounted(true); }, []);
  const isDark = resolvedTheme === "dark";

  return (
    <>
      <header className="flex items-center justify-between gap-2 px-3 pt-[calc(env(safe-area-inset-top)+0.625rem)] pb-2.5 sm:px-6 sm:pt-[calc(env(safe-area-inset-top)+1rem)] sm:pb-4 md:px-12 backdrop-blur-md border-b border-zinc-200 dark:border-white/10 sticky top-0 z-50 bg-white/90 dark:bg-black/90 transition-all duration-300">

        {/* Logo + wordmark */}
        <Link href="/" className="flex items-center gap-2 sm:gap-2.5 cursor-pointer group hover:opacity-80 shrink-0" onClick={() => setMobileMenuOpen(false)}>
          <Logo className="w-8 h-8 sm:w-10 sm:h-10" />
          <span className="text-xl sm:text-2xl font-black tracking-tight text-zinc-900 dark:text-white">
            VeriPay
          </span>
        </Link>

        {/* Desktop nav links */}
        <div className="hidden sm:flex items-center gap-4 sm:gap-6">
          <Link href="/dashboard" className="text-sm font-medium text-zinc-600 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-white transition-colors">
            Dashboard
          </Link>
          <Link href="/create" className="text-sm font-medium text-zinc-600 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-white transition-colors">
            New Escrow
          </Link>
          <Link href="/exchange" className="flex items-center gap-1.5 text-sm font-medium text-zinc-600 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-white transition-colors">
            Exchange
            <span className="px-1.5 py-0.5 rounded-full bg-zinc-900 dark:bg-white text-white dark:text-black text-[9px] font-black uppercase tracking-wider">New</span>
          </Link>

          {/* Theme switcher */}
          {mounted && (
            <div className="relative group">
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

          {/* Wallet connect + Bell */}
          <div className="flex items-center gap-2">
            {!account && passkeySupported && (
              <PasskeyButton busy={passkeyBusy} error={passkeyError} onClick={handlePasskeySignIn} dismissError={() => setPasskeyError(null)} />
            )}
            <ConnectButton
              client={client} wallets={wallets}
              appMetadata={{ name: "VeriPay", url: "https://veripay.store" }}
              theme={mounted && isDark ? "dark" : "light"}
              connectModal={{ size: "wide" }}
              chain={defineChain(10143)}
              connectButton={{ label: "Sign in" }}
            />
            <NotificationBell
              bellRef={bellRef} panelRef={panelRef}
              panelOpen={panelOpen} setPanelOpen={setPanelOpen}
              unreadCount={unreadCount} notifications={notifications}
              markAllRead={markAllRead}
              hasAccount={Boolean(account?.address)} pushState={pushState} togglePush={togglePush}
            />
          </div>
        </div>

        {/* Mobile right side: connect + bell + hamburger */}
        <div className="flex sm:hidden items-center gap-1.5 shrink-0">
          {!account && passkeySupported && (
            <PasskeyButton busy={passkeyBusy} error={passkeyError} onClick={handlePasskeySignIn} dismissError={() => setPasskeyError(null)} isMobile />
          )}
          <ConnectButton
            client={client} wallets={wallets}
            appMetadata={{ name: "VeriPay", url: "https://veripay.store" }}
            theme={mounted && isDark ? "dark" : "light"}
            connectModal={{ size: "compact" }}
            chain={defineChain(10143)}
            connectButton={{ label: "Sign in", style: compactConnectStyle }}
            detailsButton={{ style: compactConnectStyle }}
          />
          <NotificationBell
            bellRef={bellRef} panelRef={panelRef}
            panelOpen={panelOpen} setPanelOpen={setPanelOpen}
            unreadCount={unreadCount} notifications={notifications}
            markAllRead={markAllRead}
            hasAccount={Boolean(account?.address)} pushState={pushState} togglePush={togglePush}
            isMobile
          />
          <button
            onClick={() => setMobileMenuOpen((v) => !v)}
            aria-label="Toggle menu"
            className="flex items-center justify-center w-9 h-9 rounded-full bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300"
          >
            {mobileMenuOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
          </button>
        </div>
      </header>

      {/* Mobile slide-down menu */}
      {mobileMenuOpen && (
        <div className="sm:hidden fixed inset-x-0 top-[calc(env(safe-area-inset-top)+53px)] z-40 bg-white/95 dark:bg-black/95 backdrop-blur-md border-b border-zinc-200 dark:border-zinc-800 px-4 py-5 flex flex-col gap-1 animate-in fade-in slide-in-from-top-2 duration-200 shadow-xl">
          <Link href="/dashboard" onClick={() => setMobileMenuOpen(false)}
            className="flex items-center gap-3 px-4 py-3.5 rounded-xl text-base font-semibold text-zinc-800 dark:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-900 transition-colors">
            Dashboard
          </Link>
          <Link href="/create" onClick={() => setMobileMenuOpen(false)}
            className="flex items-center gap-3 px-4 py-3.5 rounded-xl text-base font-semibold text-zinc-800 dark:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-900 transition-colors">
            New Escrow
          </Link>
          <Link href="/exchange" onClick={() => setMobileMenuOpen(false)}
            className="flex items-center gap-2 px-4 py-3.5 rounded-xl text-base font-semibold text-zinc-800 dark:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-900 transition-colors">
            Buy / Sell Crypto
            <span className="px-1.5 py-0.5 rounded-full bg-zinc-900 dark:bg-white text-white dark:text-black text-[9px] font-black uppercase tracking-wider">New</span>
          </Link>
          <div className="border-t border-zinc-200 dark:border-zinc-800 mt-2 pt-4 px-4">
            <p className="text-[10px] font-black uppercase tracking-widest text-zinc-400 mb-3">Theme</p>
            <div className="flex gap-2">
              {[
                { value: "light", icon: <Sun className="w-4 h-4" />, label: "Light" },
                { value: "dark", icon: <Moon className="w-4 h-4" />, label: "Dark" },
                { value: "system", icon: <Monitor className="w-4 h-4" />, label: "System" },
              ].map(({ value, icon, label }) => (
                <button key={value} onClick={() => setTheme(value)}
                  className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-xs font-bold border transition-colors
                    ${theme === value
                      ? "bg-zinc-900 dark:bg-white text-white dark:text-black border-zinc-900 dark:border-white"
                      : "bg-zinc-100 dark:bg-zinc-900 text-zinc-600 dark:text-zinc-400 border-zinc-200 dark:border-zinc-800"
                    }`}>
                  {icon} {label}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ─── Passkey sign-in button (Face ID / fingerprint, no seed phrase) ──────────
// Only rendered when no wallet is connected and this device's browser
// supports WebAuthn. Sits beside "Sign in" as the frictionless first option
// for someone who has never touched crypto before.
function PasskeyButton({
  busy, error, onClick, dismissError, isMobile = false,
}: {
  busy: boolean;
  error: string | null;
  onClick: () => void;
  dismissError: () => void;
  isMobile?: boolean;
}) {
  return (
    <div className="relative">
      <button
        onClick={onClick}
        disabled={busy}
        aria-label="Sign in with Face ID or fingerprint"
        title="Sign in with Face ID / fingerprint — no seed phrase"
        className="flex items-center justify-center w-9 h-9 rounded-full bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-800 transition-colors disabled:opacity-60"
      >
        {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Fingerprint className="w-4 h-4" />}
      </button>

      {error && (
        <div
          className={`absolute top-full mt-2 z-[100] w-64 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-2xl p-3.5 animate-in fade-in slide-in-from-top-2 duration-200 ${isMobile ? "right-0" : "left-0"}`}
        >
          <div className="flex items-start justify-between gap-2">
            <p className="text-xs text-zinc-600 dark:text-zinc-300 leading-relaxed">{error}</p>
            <button onClick={dismissError} className="text-zinc-400 hover:text-zinc-700 dark:hover:text-white shrink-0">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Extracted Bell component (used in both mobile + desktop) ────────────────
function NotificationBell({
  bellRef, panelRef, panelOpen, setPanelOpen,
  unreadCount, notifications, markAllRead, isMobile = false,
  hasAccount, pushState, togglePush,
}: {
  bellRef: React.RefObject<HTMLButtonElement | null>;
  panelRef: React.RefObject<HTMLDivElement | null>;
  panelOpen: boolean;
  setPanelOpen: (v: boolean | ((prev: boolean) => boolean)) => void;
  unreadCount: number;
  notifications: Notification[];
  markAllRead: () => void;
  isMobile?: boolean;
  hasAccount: boolean;
  pushState: "on" | "off" | "denied" | "unsupported" | "checking";
  togglePush: () => void;
}) {
  return (
    <div className={isMobile ? "static" : "relative"}>
      <button
        ref={bellRef}
        id="notification-bell"
        onClick={() => setPanelOpen((p) => !p)}
        aria-label="Notifications"
        className={`relative flex items-center justify-center w-9 h-9 rounded-full border transition-all duration-200 focus:outline-none
          ${panelOpen
            ? "bg-zinc-900 dark:bg-white border-zinc-900 dark:border-white text-white dark:text-black shadow-lg"
            : "bg-zinc-100 dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-800"
          }`}
      >
        <Bell className="w-4 h-4" />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-zinc-900 dark:bg-white text-white dark:text-black text-[9px] font-black flex items-center justify-center border-2 border-white dark:border-black animate-pulse">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {/* Notification panel — full-width sheet on mobile, dropdown on desktop */}
      {panelOpen && (
        <div
          ref={panelRef}
          id="notification-panel"
          className={`absolute max-h-[70vh] bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-2xl overflow-hidden z-[100] flex flex-col animate-in fade-in slide-in-from-top-2 duration-200
            ${isMobile
              ? "inset-x-2 top-[calc(100%+8px)]"
              : "right-0 top-[calc(100%+12px)] w-[min(92vw,380px)]"}`}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-100 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/80">
            <div className="flex items-center gap-2">
              <Bell className="w-4 h-4 text-zinc-900 dark:text-white" />
              <span className="text-sm font-black text-zinc-900 dark:text-white uppercase tracking-wider">Notifications</span>
              {unreadCount > 0 && (
                <span className="px-2 py-0.5 rounded-full bg-zinc-900 dark:bg-white text-white dark:text-black text-[10px] font-black">{unreadCount} new</span>
              )}
            </div>
            <div className="flex items-center gap-2">
              {unreadCount > 0 && (
                <button onClick={markAllRead} className="text-[10px] font-black text-zinc-500 hover:text-zinc-900 dark:hover:text-white uppercase tracking-widest transition-colors flex items-center gap-1">
                  <Check className="w-3 h-3" /> All Read
                </button>
              )}
              <button onClick={() => setPanelOpen(false)} className="text-zinc-400 hover:text-zinc-700 dark:hover:text-white transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* List */}
          <div className="overflow-y-auto flex-1">
            {notifications.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 px-6 text-center gap-3">
                <div className="w-12 h-12 rounded-2xl bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center">
                  <Bell className="w-5 h-5 text-zinc-400" />
                </div>
                <p className="text-xs text-zinc-500 font-bold uppercase tracking-widest">No notifications yet</p>
                <p className="text-xs text-zinc-400">You&apos;ll be notified when someone creates a trade with you or sends you a message.</p>
              </div>
            ) : (
              <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
                {notifications.map((notif) => (
                  <li key={notif.id}>
                    <Link
                      href={`/trade/${notif.tradeId}`}
                      onClick={() => setPanelOpen(false)}
                      className={`flex items-start gap-3 px-4 py-3.5 hover:bg-zinc-50 dark:hover:bg-zinc-800/60 transition-colors relative ${!notif.read ? "bg-zinc-100/70 dark:bg-zinc-800/40" : ""}`}
                    >
                      <div className="mt-0.5 flex-shrink-0 w-8 h-8 rounded-xl flex items-center justify-center bg-zinc-100 dark:bg-zinc-800">
                        {notif.type === "trade"
                          ? <ShieldCheck className="w-4 h-4 text-zinc-900 dark:text-white" />
                          : <MessageSquare className="w-4 h-4 text-zinc-900 dark:text-white" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-black text-zinc-900 dark:text-white uppercase tracking-wide leading-tight">
                          {notif.type === "trade" ? "New Escrow Created" : `New Message · Trade #00${notif.tradeId}`}
                        </p>
                        <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5 leading-relaxed line-clamp-2">
                          {notif.type === "trade"
                            ? <>From <span className="font-mono">{notif.fromAddress.slice(0, 8)}…{notif.fromAddress.slice(-6)}</span> · <span className="text-zinc-900 dark:text-white font-bold">{notif.amount} MON</span></>
                            : <>&ldquo;{notif.message}&rdquo;</>}
                        </p>
                        <p className="text-[10px] text-zinc-400 mt-1 font-medium">{notif.createdAt}</p>
                      </div>
                      {!notif.read && <div className="flex-shrink-0 w-2 h-2 rounded-full bg-zinc-900 dark:bg-white mt-1.5" />}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {hasAccount && pushState !== "unsupported" && (
            <div className="px-4 py-2.5 border-t border-zinc-100 dark:border-zinc-800 bg-zinc-50/80 dark:bg-zinc-900/80">
              <button
                onClick={togglePush}
                disabled={pushState === "checking" || pushState === "denied"}
                className={`w-full flex items-center justify-center gap-2 py-2 rounded-xl text-[11px] font-black uppercase tracking-widest transition-colors
                  ${pushState === "on"
                    ? "bg-zinc-900 dark:bg-white text-white dark:text-black"
                    : "bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-700"}
                  ${pushState === "denied" ? "opacity-50 cursor-not-allowed" : ""}`}
              >
                {pushState === "on"
                  ? <><BellRing className="w-3.5 h-3.5" /> Device Alerts On</>
                  : pushState === "denied"
                  ? <><BellOff className="w-3.5 h-3.5" /> Blocked in Browser Settings</>
                  : <><Bell className="w-3.5 h-3.5" /> Enable Device Alerts</>}
              </button>
            </div>
          )}

          {notifications.length > 0 && (
            <div className="px-4 py-2 border-t border-zinc-100 dark:border-zinc-800 bg-zinc-50/80 dark:bg-zinc-900/80">
              <p className="text-[10px] text-zinc-400 text-center font-medium uppercase tracking-widest">VeriPay · Address-targeted alerts</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
