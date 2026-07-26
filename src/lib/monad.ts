// Shared setup for sending transactions to the escrow contract.
//
// Every write in this app used to go through `window.ethereum` directly —
// switch chain, add chain, then a raw viem walletClient. That only exists for
// browser-extension wallets (MetaMask, Rabby, …). It's `undefined` for
// thirdweb's in-app wallet (email/social login) and for wallets connected
// over WalletConnect, which covers most people on mobile. Tapping "Fund &
// Secure Trade" on any of those connection types hit the "No browser wallet
// detected" guard and failed before a signature was ever requested.
//
// The fix is to stop reaching around thirdweb and use its own transaction
// pipeline: `sendTransaction({ account, transaction })`, where `account`
// comes straight from `useActiveAccount()`. It works identically for every
// connection type thirdweb supports, and it switches or adds the chain on
// the wallet's behalf — the manual wallet_switchEthereumChain /
// wallet_addEthereumChain dance is no longer needed anywhere.

import { defineChain, getContract } from "thirdweb";
import { client } from "@/app/client";
import { CONTRACT_ADDRESS, escrowAbi } from "@/lib/abi";

export const monadTestnet = defineChain({
  id: 10143,
  name: "Monad Testnet",
  nativeCurrency: { name: "MON", symbol: "MON", decimals: 18 },
  rpc: "https://testnet-rpc.monad.xyz",
});

/** The escrow contract, ready for thirdweb's prepareContractCall / sendTransaction. */
export const escrowContract = getContract({
  client,
  chain: monadTestnet,
  address: CONTRACT_ADDRESS,
  abi: escrowAbi,
});

/** Turns a wallet or RPC error into something worth showing a user. */
export function friendlyTxError(err: unknown): string {
  const e = err as { shortMessage?: string; reason?: string; message?: string; code?: number };
  const raw = e.shortMessage || e.reason || e.message || "Transaction failed.";
  const lower = raw.toLowerCase();
  if (e.code === 4001 || lower.includes("reject") || lower.includes("denied") || lower.includes("cancelled")) {
    return "Transaction cancelled.";
  }
  return raw;
}
