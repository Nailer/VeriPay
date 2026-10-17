// What a seller's shared link says about them, for link previews
// (WhatsApp, Instagram, X, iMessage). Server-only.

import { getSellerByHandle } from "@/lib/sellers";
import { getReputation, type Reputation } from "@/lib/reputation";

export type SellerCard = { name: string; handle: string; reputation: Reputation | null };

export async function sellerCard(handle: string): Promise<SellerCard | null> {
  const seller = await getSellerByHandle(handle);
  if (!seller) return null;
  // A preview must never fail just because the record is slow to load.
  const reputation = await getReputation(seller.address).then((r) => r.reputation).catch(() => null);
  return { name: seller.name, handle: seller.handle, reputation };
}

/** One line a buyer can read in a chat preview. */
export function recordLine(r: Reputation | null): string {
  if (!r || r.totalTrades === 0) return "New on VeriPay — your money is held until your order arrives.";
  const paid = `${r.completedTrades} order${r.completedTrades === 1 ? "" : "s"} paid out`;
  const disputes = `${r.disputedTrades} dispute${r.disputedTrades === 1 ? "" : "s"}`;
  return `${paid} · ${disputes} — your money is held until your order arrives.`;
}
