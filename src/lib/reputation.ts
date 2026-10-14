// Per-address trade reputation, derived only from the escrow contract's own
// on-chain record — never from anything VeriPay stores and could edit.
//
// Two sources, same numbers:
//   1. Envio (indexer/) — fast, event-indexed. Used whenever ENVIO_GRAPHQL_URL
//      is set and reachable.
//   2. The chain directly — reads every trade's settled state from the
//      contract. Slower, but needs nothing extra deployed, so the feature works
//      on a fresh checkout and keeps working if the indexer is down.
//
// The counting rules are deliberately identical to indexer/src/EventHandlers.ts
// so the two sources never disagree:
//   totalTrades     +1 for buyer and seller on every trade
//   completedTrades +1 for the seller when they were paid (release,
//                   auto-release, or a dispute ruling that gave them a share)
//   refundedTrades  +1 for the buyer when they were repaid
//   disputedTrades  +1 for both parties when either raised a dispute

import { createPublicClient, http } from "viem";
import { readNextTradeId, readTrade, formatTradeAmount, type EscrowTrade } from "@/lib/escrow";
import { CONTRACT_ADDRESS } from "@/lib/abi";

export type Reputation = {
  address: string;
  totalTrades: number;
  completedTrades: number;
  disputedTrades: number;
  refundedTrades: number;
};

export type TradeSummary = {
  id: number;
  role: "buyer" | "seller";
  counterparty: string;
  amount: string;
  symbol: string;
  status: "open" | "released" | "refunded" | "disputed" | "split";
  metadata: string;
};

export type ReputationResult = {
  source: "envio" | "chain";
  reputation: Reputation;
  trades?: TradeSummary[];
};

const RPC = process.env.MONAD_RPC_URL || process.env.NEXT_PUBLIC_MONAD_RPC_URL || "https://testnet-rpc.monad.xyz";
const SCAN_LIMIT = 1000;
const CACHE_MS = 30_000;

const empty = (address: string): Reputation => ({
  address, totalTrades: 0, completedTrades: 0, disputedTrades: 0, refundedTrades: 0,
});

// ─── Envio ──────────────────────────────────────────────────────────────────

const QUERY = `
  query Reputation($id: String!) {
    AddressReputation(where: { id: { _eq: $id } }) {
      id totalTrades completedTrades disputedTrades refundedTrades
    }
  }
`;

async function fromEnvio(address: string): Promise<Reputation | null> {
  const url = process.env.ENVIO_GRAPHQL_URL;
  if (!url) return null;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: QUERY, variables: { id: address } }),
      next: { revalidate: 30 },
    });
    if (!res.ok) return null;
    const json = await res.json();
    if (json.errors) return null;
    const row = json?.data?.AddressReputation?.[0];
    return row
      ? { address, totalTrades: row.totalTrades, completedTrades: row.completedTrades, disputedTrades: row.disputedTrades, refundedTrades: row.refundedTrades }
      : empty(address);
  } catch {
    return null;
  }
}

// ─── Chain ──────────────────────────────────────────────────────────────────

let cache: { at: number; contract: string; trades: { id: number; t: EscrowTrade }[] } | null = null;

async function allTrades() {
  if (cache && cache.contract === CONTRACT_ADDRESS && Date.now() - cache.at < CACHE_MS) return cache.trades;

  const client = createPublicClient({ transport: http(RPC, { retryCount: 3 }) });
  const next = await readNextTradeId(client as never);
  const start = Math.max(0, next - SCAN_LIMIT);
  const ids = Array.from({ length: next - start }, (_, i) => start + i);

  const trades: { id: number; t: EscrowTrade }[] = [];
  for (let i = 0; i < ids.length; i += 20) {
    const batch = await Promise.all(ids.slice(i, i + 20).map(async (id) => ({ id, t: await readTrade(client as never, id) })));
    trades.push(...batch);
  }

  cache = { at: Date.now(), contract: CONTRACT_ADDRESS, trades };
  return trades;
}

function statusOf(t: EscrowTrade): TradeSummary["status"] {
  if (t.released && t.refunded) return "split";
  if (t.released) return "released";
  if (t.refunded) return "refunded";
  if (t.disputed) return "disputed";
  return "open";
}

async function fromChain(address: string): Promise<{ reputation: Reputation; trades: TradeSummary[] }> {
  const rep = empty(address);
  const summaries: TradeSummary[] = [];

  for (const { id, t } of await allTrades()) {
    const buyer = t.buyer.toLowerCase();
    const seller = t.seller.toLowerCase();
    if (buyer !== address && seller !== address) continue;

    const role = seller === address ? "seller" : "buyer";
    rep.totalTrades += buyer === seller ? 2 : 1;
    if (t.disputed) rep.disputedTrades += buyer === seller ? 2 : 1;
    if (seller === address && t.released) rep.completedTrades += 1;
    if (buyer === address && t.refunded) rep.refundedTrades += 1;

    const { formatted, symbol } = formatTradeAmount(t);
    summaries.push({
      id, role,
      counterparty: role === "seller" ? t.buyer : t.seller,
      amount: formatted, symbol,
      status: statusOf(t),
      metadata: t.metadata,
    });
  }

  return { reputation: rep, trades: summaries.reverse() };
}

// ─── Public ─────────────────────────────────────────────────────────────────

export async function getReputation(rawAddress: string, withTrades = false): Promise<ReputationResult> {
  const address = rawAddress.toLowerCase();

  if (!withTrades) {
    const envio = await fromEnvio(address);
    if (envio) return { source: "envio", reputation: envio };
  }

  const { reputation, trades } = await fromChain(address);
  return { source: "chain", reputation, trades: withTrades ? trades : undefined };
}
