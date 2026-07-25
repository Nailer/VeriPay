import { NextResponse } from "next/server";
import { getPricing, MIN_ORDER_NGN, MAX_ORDER_NGN, QUOTE_TTL_MS } from "@/lib/pricing";

// Live pricing for the exchange UI. Refreshed from upstream markets at most
// every 10s; clients poll faster than that and ride the server-side cache.
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const pricing = await getPricing();

    return NextResponse.json(
      {
        coins: pricing.coins.map((c) => ({
          symbol: c.symbol,
          name: c.name,
          usd: c.usd,
          ngn: c.ngn,
          buyNgn: c.buyNgn,
          sellNgn: c.sellNgn,
          source: c.source,
        })),
        ngnPerUsd: pricing.ngnPerUsd,
        ngnRateSource: pricing.ngnRateSource,
        spreadPercent: pricing.spreadPercent,
        quoteTtlMs: QUOTE_TTL_MS,
        minNgn: MIN_ORDER_NGN,
        maxNgn: MAX_ORDER_NGN,
        at: pricing.at,
        live: pricing.live,
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (err) {
    console.error("rates error:", err);
    return NextResponse.json({ error: "Pricing temporarily unavailable" }, { status: 503 });
  }
}
