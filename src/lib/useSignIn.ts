"use client";

import { useCallback, useEffect, useState } from "react";
import { useConnectModal, useSetActiveWallet } from "thirdweb/react";
import { client } from "@/app/client";
import { monadTestnet } from "@/lib/monad";
import { wallets } from "@/lib/wallets";
import { connectWithPasskey, friendlyPasskeyError, isPasskeySupported } from "@/lib/mera";

/**
 * Sign-in for pages that need an account mid-flow (pay links, seller setup):
 * passkey first — Face ID / fingerprint, nothing to install or write down —
 * with the full wallet list as the fallback.
 */
export function useSignIn() {
  const setActiveWallet = useSetActiveWallet();
  const { connect } = useConnectModal();
  const [passkeySupported, setPasskeySupported] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => setPasskeySupported(isPasskeySupported()), []);

  const withPasskey = useCallback(async () => {
    setBusy(true); setError("");
    try {
      const wallet = await connectWithPasskey();
      await wallet.connect({ client } as Parameters<typeof wallet.connect>[0]);
      await setActiveWallet(wallet);
    } catch (err) {
      setError(friendlyPasskeyError(err));
    } finally {
      setBusy(false);
    }
  }, [setActiveWallet]);

  const withOther = useCallback(async () => {
    setError("");
    try {
      await connect({ client, wallets, chain: monadTestnet, size: "compact" });
    } catch { /* modal dismissed */ }
  }, [connect]);

  return { passkeySupported, busy, error, withPasskey, withOther };
}
