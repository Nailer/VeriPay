"use client";

// Passkey-native onboarding via Category Labs' mera (an official Monad
// hackathon bounty target — see CLAUDE.md's "Hackathon build" notes).
//
// The account is derived deterministically from the passkey's WebAuthn PRF
// output: same passkey -> same 32-byte seed -> same address, every time, on
// any device that has the passkey (Face ID / fingerprint / device PIN — no
// seed phrase to write down, no email/OTP hop). That's the whole point for
// VeriPay's audience: most first-time users have never held a seed phrase
// and won't want to.
//
// mera itself only produces a signing key; it has no opinion on which chain
// or wallet framework you use it with. This file wires that key into
// thirdweb's wallet system so it works everywhere `useActiveAccount()` /
// `sendTransaction()` already does across the app.
//
// One important wiring detail: thirdweb ships `viemAdapter.wallet.fromViem`
// as the "current" way to wrap a viem wallet client, but it proxies raw
// EIP-1193 `.request()` calls straight through to the transport — correct
// for a real injected provider, but a derived local key over a plain RPC
// transport doesn't understand wallet-specific methods like
// `eth_sendTransaction`. That's the exact "No browser wallet detected" bug
// class this project hit once already (see monad.ts). The fix here is the
// same shape as that fix: build the Account explicitly using viem's proper
// signing Actions (`sendTransaction`, `signMessage`, `signTypedData`), then
// hand it to `createWalletAdapter` — verified by reading thirdweb's own
// source, not assumed from docs.

import { createWalletClient, http, type Chain as ViemChain } from "viem";
import { defineChain } from "thirdweb";
import { createWalletAdapter, type Account as ThirdwebAccount, type Wallet } from "thirdweb/wallets";
import {
  createPasskeyWithPrfOutput,
  getPasskeyPrfOutput,
  createSecp256k1SigningSession,
  isMeraError,
  type PasskeyCredentialMetadata,
} from "@category-labs/mera";
import { toViemAccount } from "@category-labs/mera/viem";
import { HDKey } from "@scure/bip32";
import { entropyToMnemonic, mnemonicToSeedSync } from "@scure/bip39";
import { wordlist } from "@scure/bip39/wordlists/english.js";
import { client } from "@/app/client";
import { MONAD_RPC_URL } from "@/lib/monad";

const CREDENTIAL_KEY = "veripay-passkey-credential";
const ACCOUNT_PATH = "m/44'/60'/0'/0/0";
const MONAD_RPC = MONAD_RPC_URL;

const monadTestnetThirdweb = defineChain({
  id: 10143,
  name: "Monad Testnet",
  nativeCurrency: { name: "MON", symbol: "MON", decimals: 18 },
  rpc: MONAD_RPC,
});

const monadTestnetViem: ViemChain = {
  id: 10143,
  name: "Monad Testnet",
  nativeCurrency: { name: "MON", symbol: "MON", decimals: 18 },
  rpcUrls: { default: { http: [MONAD_RPC] } },
};

function readStoredCredential(): PasskeyCredentialMetadata | undefined {
  if (typeof window === "undefined") return undefined;
  try {
    const raw = localStorage.getItem(CREDENTIAL_KEY);
    return raw ? (JSON.parse(raw) as PasskeyCredentialMetadata) : undefined;
  } catch {
    return undefined;
  }
}

function storeCredential(credential: PasskeyCredentialMetadata) {
  try {
    localStorage.setItem(CREDENTIAL_KEY, JSON.stringify(credential));
  } catch {
    // Storage can fail (private mode, quota) — the passkey itself still
    // works, the user just won't get the "known credential" fast path.
  }
}

export function isPasskeySupported(): boolean {
  return typeof window !== "undefined" && typeof window.PublicKeyCredential !== "undefined";
}

export function hasStoredPasskey(): boolean {
  return Boolean(readStoredCredential());
}

/** 32-byte PRF output -> deterministic Ethereum signing key -> viem LocalAccount. */
function deriveViemAccount(prfOutput: Uint8Array) {
  const seed = mnemonicToSeedSync(entropyToMnemonic(prfOutput, wordlist));
  const node = HDKey.fromMasterSeed(seed).derive(ACCOUNT_PATH);
  if (!node.privateKey) throw new Error("Passkey derivation produced no signing key.");
  const session = createSecp256k1SigningSession({ privateKey: node.privateKey });
  return toViemAccount(session);
}

function walletFromViemAccount(viemAccount: ReturnType<typeof toViemAccount>): Wallet {
  const walletClient = createWalletClient({
    account: viemAccount,
    chain: monadTestnetViem,
    transport: http(MONAD_RPC),
  });

  const adaptedAccount: ThirdwebAccount = {
    address: viemAccount.address,
    sendTransaction: async (tx) => {
      // thirdweb's own viem adapter does the same cast here — its
      // SendTransactionOption shape and viem's parameters overlap in
      // practice but aren't nominally the same type.
      // biome-ignore lint/suspicious/noExplicitAny: matches thirdweb's own adapter pattern
      const hash = await walletClient.sendTransaction({
        account: viemAccount,
        chain: monadTestnetViem,
        ...(tx as any),
      });
      return { transactionHash: hash };
    },
    signMessage: async ({ message }) => walletClient.signMessage({ account: viemAccount, message }),
    signTypedData: async (typedData) =>
      // biome-ignore lint/suspicious/noExplicitAny: generic typed-data shape, not used by any flow in this app today
      walletClient.signTypedData({ account: viemAccount, ...(typedData as any) }),
  };

  return createWalletAdapter({
    client,
    adaptedAccount,
    chain: monadTestnetThirdweb,
    onDisconnect: () => {},
    switchChain: () => {
      // This wallet only ever operates on Monad testnet — nothing to switch to.
    },
  });
}

/** First-time sign-up: creates a brand-new passkey and its derived account. */
export async function createPasskeyWallet(): Promise<Wallet> {
  const rpId = window.location.hostname;
  const created = await createPasskeyWithPrfOutput({
    rp: { id: rpId, name: "VeriPay" },
    user: { name: `veripay-${Date.now()}`, displayName: "VeriPay account" },
  });
  storeCredential({ credentialId: created.credentialId, transports: created.transports });
  return walletFromViemAccount(deriveViemAccount(created.prfOutput));
}

/** Returning user: re-derives the SAME account from the existing passkey. */
export async function signInWithPasskey(): Promise<Wallet> {
  const rpId = window.location.hostname;
  const stored = readStoredCredential();
  const { prfOutput, credentialId, } = await getPasskeyPrfOutput({ rpId, credential: stored });
  if (!stored) storeCredential({ credentialId, transports: undefined });
  return walletFromViemAccount(deriveViemAccount(prfOutput));
}

/** One call that does the right thing whether this device has signed in before. */
export async function connectWithPasskey(): Promise<Wallet> {
  return hasStoredPasskey() ? signInWithPasskey() : createPasskeyWallet();
}

export function friendlyPasskeyError(err: unknown): string {
  if (isMeraError(err)) {
    switch (err.code) {
      case "PRF_UNAVAILABLE":
        return "This device's biometric hardware doesn't support the passkey feature we need. Try Sign in instead.";
      case "PASSKEY_OPERATION_FAILED":
        return "Cancelled, or your device couldn't complete Face ID / fingerprint verification.";
      default:
        return "Couldn't set up a passkey on this device. Try Sign in instead.";
    }
  }
  return err instanceof Error ? err.message : "Something went wrong setting up your passkey.";
}
