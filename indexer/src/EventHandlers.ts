// Turns VeriPayEscrow's raw trade events into two things anyone can query:
// the full trade history (TradeRecord), and a rolled-up per-address
// reputation figure (AddressReputation) derived entirely from it. Nothing
// here is written directly except as a consequence of a TradeRecord's
// status changing, so the numbers can always be re-derived from
// TradeRecord alone if they're ever in question — that's the whole point.
//
// Address IDs are lowercased throughout, matching the rest of the app's
// convention (Supabase's notifications.to_address is stored the same way).

import { indexer, type AddressReputation, type TradeRecord } from "envio";

type ReputationContext = {
  AddressReputation: {
    get(id: string): Promise<AddressReputation | undefined>;
    set(entity: AddressReputation): void;
  };
};

const emptyReputation = (id: string): AddressReputation => ({
  id,
  totalTrades: 0,
  completedTrades: 0,
  disputedTrades: 0,
  refundedTrades: 0,
  lastActivityAt: 0n,
});

async function bumpReputation(
  context: ReputationContext,
  address: string,
  timestamp: bigint,
  patch: Partial<Pick<AddressReputation, "totalTrades" | "completedTrades" | "disputedTrades" | "refundedTrades">>,
) {
  const id = address.toLowerCase();
  const existing = (await context.AddressReputation.get(id)) ?? emptyReputation(id);
  context.AddressReputation.set({
    ...existing,
    totalTrades: existing.totalTrades + (patch.totalTrades ?? 0),
    completedTrades: existing.completedTrades + (patch.completedTrades ?? 0),
    disputedTrades: existing.disputedTrades + (patch.disputedTrades ?? 0),
    refundedTrades: existing.refundedTrades + (patch.refundedTrades ?? 0),
    lastActivityAt: timestamp,
  });
}

indexer.onEvent(
  { contract: "VeriPayEscrow", event: "TradeCreated" },
  async ({ event, context }) => {
    const { id, buyer, seller, amount } = event.params;
    const timestamp = BigInt(event.block.timestamp);

    const trade: TradeRecord = {
      id: id.toString(),
      buyer: buyer.toLowerCase(),
      seller: seller.toLowerCase(),
      amount,
      token: "0x0000000000000000000000000000000000000000",
      status: "open",
      createdAt: timestamp,
    };
    context.TradeRecord.set(trade);

    await bumpReputation(context, buyer, timestamp, { totalTrades: 1 });
    await bumpReputation(context, seller, timestamp, { totalTrades: 1 });
  },
);

indexer.onEvent(
  { contract: "VeriPayEscrow", event: "TradeToken" },
  async ({ event, context }) => {
    const trade = await context.TradeRecord.get(event.params.id.toString());
    if (!trade) return; // TradeCreated always fires first in the same tx — nothing to attach to otherwise.
    context.TradeRecord.set({ ...trade, token: event.params.token.toLowerCase() });
  },
);

indexer.onEvent(
  { contract: "VeriPayEscrow", event: "FundsReleased" },
  async ({ event, context }) => {
    const trade = await context.TradeRecord.get(event.params.id.toString());
    if (!trade) return;
    const timestamp = BigInt(event.block.timestamp);
    const to = event.params.to.toLowerCase();

    if (to === trade.seller) {
      context.TradeRecord.set({ ...trade, status: "released" });
      await bumpReputation(context, trade.seller, timestamp, { completedTrades: 1 });
    } else if (to === trade.buyer) {
      context.TradeRecord.set({ ...trade, status: "refunded" });
      await bumpReputation(context, trade.buyer, timestamp, { refundedTrades: 1 });
    }
  },
);

indexer.onEvent(
  { contract: "VeriPayEscrow", event: "DisputeRaised" },
  async ({ event, context }) => {
    const trade = await context.TradeRecord.get(event.params.id.toString());
    if (!trade) return;
    const timestamp = BigInt(event.block.timestamp);

    context.TradeRecord.set({ ...trade, status: "disputed" });
    await bumpReputation(context, trade.buyer, timestamp, { disputedTrades: 1 });
    await bumpReputation(context, trade.seller, timestamp, { disputedTrades: 1 });
  },
);

indexer.onEvent(
  { contract: "VeriPayEscrow", event: "DisputeResolved" },
  async ({ event, context }) => {
    const trade = await context.TradeRecord.get(event.params.id.toString());
    if (!trade) return;
    const timestamp = BigInt(event.block.timestamp);

    context.TradeRecord.set({ ...trade, status: "resolved" });
    if (event.params.toSeller > 0n) {
      await bumpReputation(context, trade.seller, timestamp, { completedTrades: 1 });
    }
    if (event.params.toBuyer > 0n) {
      await bumpReputation(context, trade.buyer, timestamp, { refundedTrades: 1 });
    }
  },
);
