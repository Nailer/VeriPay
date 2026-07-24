import { NextResponse } from "next/server";

// Live NGN prices from CoinGecko, cached for 60s, with static fallbacks so the
// exchange keeps working even if the price API is unreachable.

export type CoinInfo = {
  symbol: string;
  name: string;
  geckoId: string;
  ngn: number; // NGN per 1 coin
};

const COINS: Omit<CoinInfo, "ngn">[] = [
  { symbol: "MON", name: "Monad", geckoId: "monad" },
  { symbol: "USDT", name: "Tether", geckoId: "tether" },
  { symbol: "BTC", name: "Bitcoin", geckoId: "bitcoin" },
  { symbol: "ETH", name: "Ethereum", geckoId: "ethereum" },
  { symbol: "SOL", name: "Solana", geckoId: "solana" },
];

// Used when CoinGecko is unreachable (approximate figures).
const FALLBACK_NGN: Record<string, number> = {
  MON: 45,
  USDT: 1480,
  BTC: 140_000_000,
  ETH: 4_600_000,
  SOL: 210_000,
};

type Cache = { at: number; coins: CoinInfo[]; live: boolean };
const g = globalThis as unknown as { __mpRatesCache?: Cache };

export async function GET() {
  const now = Date.now();
  if (g.__mpRatesCache && now - g.__mpRatesCache.at < 60_000) {
    return NextResponse.json({ coins: g.__mpRatesCache.coins, live: g.__mpRatesCache.live });
  }

  let prices: Record<string, { ngn?: number }> = {};
  let live = false;
  try {
    const ids = COINS.map((c) => c.geckoId).join(",");
    const res = await fetch(
      `https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=ngn`,
      { signal: AbortSignal.timeout(5000), cache: "no-store" }
    );
    if (res.ok) {
      prices = await res.json();
      live = true;
    }
  } catch { /* fall back to static rates */ }

  const coins: CoinInfo[] = COINS.map((c) => ({
    ...c,
    ngn: prices[c.geckoId]?.ngn ?? FALLBACK_NGN[c.symbol],
  }));

  g.__mpRatesCache = { at: now, coins, live };
  return NextResponse.json({ coins, live });
}
