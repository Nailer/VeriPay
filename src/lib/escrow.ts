// Compatibility layer for reading escrow trades.
//
// There are two versions of the contract in the wild:
//
//   v1 — the original. `trades()` returns 6 fields. No fee, no disputes.
//   v2 — VeriPayEscrow. `trades()` returns 12 fields, with a fee, disputes,
//        an auto-release deadline, and the asset the trade was opened in
//        (native MON, or an ERC-20 like Agora's AUSD).
//
// Decoding a v1 response with the v2 ABI fails outright, which is how the
// dashboard silently went blank. Rather than force a redeploy before the app
// works again, this module detects which version is deployed and normalises
// both into one shape.

import { formatEther, formatUnits, type PublicClient } from "viem";
import { CONTRACT_ADDRESS, escrowAbi } from "@/lib/abi";
import { AUSD_ADDRESS, AUSD_DECIMALS } from "@/lib/monad";

/** address(0) in the Trade struct means the trade escrows native MON. */
export const NATIVE_TOKEN_ADDRESS = "0x0000000000000000000000000000000000000000";

/** The original contract's `trades` getter, kept only for reading old data. */
export const legacyEscrowAbi = [
  {
    inputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    name: "trades",
    outputs: [
      { internalType: "address", name: "buyer", type: "address" },
      { internalType: "address", name: "seller", type: "address" },
      { internalType: "uint256", name: "amount", type: "uint256" },
      { internalType: "bool", name: "released", type: "bool" },
      { internalType: "bool", name: "sellerApprovedRefund", type: "bool" },
      { internalType: "string", name: "metadata", type: "string" },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "nextTradeId",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
] as const;

export type EscrowTrade = {
  buyer: string;
  seller: string;
  amount: bigint;
  released: boolean;
  sellerApprovedRefund: boolean;
  metadata: string;
  createdAt: bigint;
  autoReleaseAt: bigint;
  disputed: boolean;
  refunded: boolean;
  feeBps: number;
  /** address(0) = native MON. Otherwise an ERC-20 address (e.g. AUSD). */
  token: string;
  /** True when this came from the old contract, which has no fee or disputes. */
  legacy: boolean;
};

// Detected once per contract address, then reused.
const versionCache = new Map<string, boolean>(); // address -> isLegacy

/**
 * Works out which contract is deployed by calling a function that only exists
 * on v2. On v1 it reverts, which is our signal.
 */
export async function isLegacyContract(client: PublicClient): Promise<boolean> {
  const key = CONTRACT_ADDRESS.toLowerCase();
  const cached = versionCache.get(key);
  if (cached !== undefined) return cached;

  let legacy: boolean;
  try {
    await client.readContract({
      address: CONTRACT_ADDRESS,
      abi: escrowAbi,
      functionName: "feeBps",
    });
    legacy = false;
  } catch {
    legacy = true;
  }

  versionCache.set(key, legacy);
  return legacy;
}

export async function readNextTradeId(client: PublicClient): Promise<number> {
  const id = (await client.readContract({
    address: CONTRACT_ADDRESS,
    abi: escrowAbi,
    functionName: "nextTradeId",
  })) as bigint;
  return Number(id);
}

/** Reads one trade from whichever contract version is deployed. */
export async function readTrade(client: PublicClient, id: number | bigint): Promise<EscrowTrade> {
  const tradeId = BigInt(id);
  const legacy = await isLegacyContract(client);

  if (legacy) {
    const r = (await client.readContract({
      address: CONTRACT_ADDRESS,
      abi: legacyEscrowAbi,
      functionName: "trades",
      args: [tradeId],
    })) as readonly [string, string, bigint, boolean, boolean, string];

    return {
      buyer: r[0],
      seller: r[1],
      amount: r[2],
      released: r[3],
      sellerApprovedRefund: r[4],
      metadata: r[5],
      // The old contract has none of these concepts.
      createdAt: BigInt(0),
      autoReleaseAt: BigInt(0),
      disputed: false,
      refunded: false,
      feeBps: 0,
      token: NATIVE_TOKEN_ADDRESS,
      legacy: true,
    };
  }

  const r = (await client.readContract({
    address: CONTRACT_ADDRESS,
    abi: escrowAbi,
    functionName: "trades",
    args: [tradeId],
  })) as readonly [string, string, bigint, boolean, boolean, string, bigint, bigint, boolean, boolean, number, string];

  return {
    buyer: r[0],
    seller: r[1],
    amount: r[2],
    released: r[3],
    sellerApprovedRefund: r[4],
    metadata: r[5],
    createdAt: r[6],
    autoReleaseAt: r[7],
    disputed: r[8],
    refunded: r[9],
    feeBps: Number(r[10]),
    token: r[11],
    legacy: false,
  };
}

/**
 * Formats a raw trade amount for display, using the right decimals and
 * symbol for whichever asset the trade actually used. `formatEther` alone
 * is wrong for an AUSD trade — AUSD uses 6 decimals, not 18 — so every page
 * showing a trade amount should go through this rather than call
 * formatEther directly.
 */
export function formatTradeAmount(trade: Pick<EscrowTrade, "amount" | "token">): { formatted: string; symbol: string } {
  if (trade.token?.toLowerCase() === AUSD_ADDRESS.toLowerCase()) {
    return { formatted: formatUnits(trade.amount, AUSD_DECIMALS), symbol: "AUSD" };
  }
  return { formatted: formatEther(trade.amount), symbol: "MON" };
}
