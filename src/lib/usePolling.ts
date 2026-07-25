"use client";

import { useEffect, useRef } from "react";

/**
 * Poll a callback on an interval, but only while the tab is actually visible.
 *
 * Every screen in this app refreshes something (rates, orders, chat, alerts).
 * A plain setInterval keeps firing in background tabs, so a user with three
 * tabs open hammers the API forever and drains their battery — on mobile that
 * shows up as the whole app feeling sluggish.
 *
 * This hook:
 *   • runs the callback immediately on mount
 *   • suspends the timer when the tab is hidden
 *   • fires once straight away on return, so the UI is never stale
 *   • takes `enabled` so callers can stop polling entirely (e.g. an order that
 *     has reached a terminal state has nothing left to poll for)
 */
export function usePolling(
  callback: () => void | Promise<void>,
  intervalMs: number,
  enabled = true
) {
  // Keep the latest callback without restarting the timer on every render.
  const saved = useRef(callback);
  useEffect(() => { saved.current = callback; }, [callback]);

  useEffect(() => {
    if (!enabled) return;

    let timer: ReturnType<typeof setInterval> | undefined;
    const run = () => { void saved.current(); };

    const start = () => {
      if (timer !== undefined) return;
      timer = setInterval(run, intervalMs);
    };
    const stop = () => {
      if (timer === undefined) return;
      clearInterval(timer);
      timer = undefined;
    };

    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        run();   // catch up immediately
        start();
      } else {
        stop();
      }
    };

    run();
    if (document.visibilityState === "visible") start();
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [intervalMs, enabled]);
}
