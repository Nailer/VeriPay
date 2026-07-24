"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { useActiveAccount } from "thirdweb/react";

// Fire-and-forget tracking: logs page views on every route change, and logs
// a wallet_connect event the first time a wallet becomes active in this tab.
// Silently no-ops on any failure — analytics must never affect the UI.
export default function Analytics() {
  const pathname = usePathname();
  const account = useActiveAccount();
  const trackedAddress = useRef<string | null>(null);

  useEffect(() => {
    fetch("/api/track", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        kind: "page_view",
        path: pathname,
        walletAddress: account?.address,
        referrer: typeof document !== "undefined" ? document.referrer : undefined,
      }),
    }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  useEffect(() => {
    if (!account?.address) return;
    if (trackedAddress.current === account.address) return;
    trackedAddress.current = account.address;

    fetch("/api/track", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        kind: "wallet_connect",
        walletAddress: account.address,
        userAgent: typeof navigator !== "undefined" ? navigator.userAgent : undefined,
      }),
    }).catch(() => {});
  }, [account?.address]);

  return null;
}
