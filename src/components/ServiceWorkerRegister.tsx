"use client";

import { useEffect } from "react";

// Registers the app-shell service worker so the site is installable
// (Add to Home Screen / desktop install prompt). Production only — in dev
// a cached worker fighting Turbopack HMR is a worse bug than no offline page.
export default function ServiceWorkerRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  }, []);

  return null;
}
