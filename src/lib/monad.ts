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

// Alchemy's Monad testnet endpoint when configured (Alchemy hackathon
// bounty), falling back to the public node otherwise. Client-exposed by
// design, same as NEXT_PUBLIC_THIRDWEB_CLIENT_ID — restrict it to
// veripay.store in Alchemy's dashboard rather than treating it as secret.
export const MONAD_RPC_URL = process.env.NEXT_PUBLIC_MONAD_RPC_URL || "https://testnet-rpc.monad.xyz";

export const monadTestnet = defineChain({
  id: 10143,
  name: "Monad Testnet",
  nativeCurrency: { name: "MON", symbol: "MON", decimals: 18 },
  rpc: MONAD_RPC_URL,
});

/** The escrow contract, ready for thirdweb's prepareContractCall / sendTransaction. */
export const escrowContract = getContract({
  client,
  chain: monadTestnet,
  address: CONTRACT_ADDRESS,
  abi: escrowAbi,
});

// Agora's AUSD on Monad testnet (Agora hackathon bounty) — verified on-chain
// directly rather than trusted from search results, which turned up a
// mainnet-only address with no code on this chain. Confirmed live here:
// symbol() -> "AUSD", decimals() -> 6.
// Overridable without a redeploy (the escrow accepts any ERC-20) — if Agora
// points us at a different official testnet AUSD, set NEXT_PUBLIC_AUSD_ADDRESS.
export const AUSD_ADDRESS = (process.env.NEXT_PUBLIC_AUSD_ADDRESS ||
  "0x333a12e2B519DA16EBE75012d54574C16ef4463f") as `0x${string}`;
export const AUSD_DECIMALS = 6;

// VeriPay Test Naira (vNGN) — the testnet stand-in for a naira stablecoin
// that makes the pay-link flow naira-native: a buyer pays ₦ by card and
// exactly that many vNGN are locked in escrow, so no screen ever needs to
// mention MON or a price. See contracts/test/VeriPayTestNaira.sol for what it
// is and — importantly — isn't.
export const NGN_TOKEN_ADDRESS = (process.env.NEXT_PUBLIC_NGN_TOKEN_ADDRESS ||
  "0xdbb53d0a2d1b91ef6a41cf1128fef562ffc531eb") as `0x${string}`;
export const NGN_TOKEN_DECIMALS = 6;

export const erc20Abi = [
  {
    inputs: [{ name: "account", type: "address" }],
    name: "balanceOf",
    outputs: [{ type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" },
    ],
    name: "allowance",
    outputs: [{ type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    name: "approve",
    outputs: [{ type: "bool" }],
    stateMutability: "nonpayable",
    type: "function",
  },
] as const;

/** AUSD, ready for thirdweb's prepareContractCall / sendTransaction. */
export const ausdContract = getContract({
  client,
  chain: monadTestnet,
  address: AUSD_ADDRESS,
  abi: erc20Abi,
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

/** vNGN, ready for thirdweb's prepareContractCall / sendTransaction. */
export const ngnContract = getContract({
  client,
  chain: monadTestnet,
  address: NGN_TOKEN_ADDRESS,
  abi: erc20Abi,
});
