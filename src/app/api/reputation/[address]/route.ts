import { NextResponse } from "next/server";
import { getReputation } from "@/lib/reputation";

export type { Reputation, TradeSummary } from "@/lib/reputation";

// ─── GET /api/reputation/[address][?trades=1] ────────────────────────────────
// On-chain trade reputation for one address. Envio when it's configured and
// reachable, otherwise read straight from the contract — see lib/reputation.ts.
// `?trades=1` also returns that address's trade history (always chain-read).
export async function GET(request: Request, { params }: { params: Promise<{ address: string }> }) {
  const { address } = await params;

  if (!address || !/^0x[a-fA-F0-9]{40}$/.test(address)) {
    return NextResponse.json({ error: "Invalid address" }, { status: 400 });
  }

  const withTrades = new URL(request.url).searchParams.get("trades") === "1";

  try {
    const result = await getReputation(address, withTrades);
    return NextResponse.json({ configured: true, ...result });
  } catch (err) {
    console.error("Reputation GET error:", err);
    return NextResponse.json({ configured: true, source: null, reputation: null }, { status: 502 });
  }
}
