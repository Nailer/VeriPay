// ─── VeriPay pricing engine ─────────────────────────────────────────────────
//
// Every price the user is quoted is computed HERE, on the server. The browser
// never tells us what a coin is worth — it only says which coin and how much
// Naira. That closes the "craft a request with your own rate" hole.
//
// A Naira price is built from two independent numbers:
//
//   1. coin → USD      live spot, from Binance (falls back to CoinGecko)
//   2. USD  → NGN      the *street* rate, from Bybit's live P2P order book
//
// Step 2 matters more than people expect. CoinGecko's "ngn" price uses the
// official CBN rate (~₦1,368/$ today); the rate Nigerians actually transact at
// on Bybit/Binance P2P is different. Quoting the official rate while buying
// liquidity at the street rate loses money on every single order — so we price
// off the same book Bybit shows.

export type PriceSource = "binance" | "coingecko" | "fallback";

export type CoinPrice = {
  symbol: string;
  name: string;
  usd: number;
  /** Mid-market NGN price — no spread applied. */
  ngn: number;
  /** What a user pays us per coin (mid + spread). */
  buyNgn: number;
  /** What we pay a user per coin (mid − spread). */
  sellNgn: number;
  source: PriceSource;
};

export type PricingSnapshot = {
  coins: CoinPrice[];
  /** Street NGN per 1 USD. */
  ngnPerUsd: number;
  ngnRateSource: "bybit-p2p" | "coingecko" | "env" | "fallback";
  spreadPercent: number;
  /** When this snapshot was taken (ms). */
  at: number;
  /** True when both legs came from a live market, not a fallback constant. */
  live: boolean;
};

const COINS = [
  { symbol: "MON", name: "Monad", geckoId: "monad", binance: null },
  { symbol: "USDT", name: "Tether", geckoId: "tether", binance: null },
  { symbol: "BTC", name: "Bitcoin", geckoId: "bitcoin", binance: "BTCUSDT" },
  { symbol: "ETH", name: "Ethereum", geckoId: "ethereum", binance: "ETHUSDT" },
  { symbol: "SOL", name: "Solana", geckoId: "solana", binance: "SOLUSDT" },
] as const;

export const SUPPORTED_SYMBOLS = COINS.map((c) => c.symbol) as readonly string[];

// Last-resort USD prices, only used if every upstream is unreachable.
const FALLBACK_USD: Record<string, number> = {
  MON: 0.021, USDT: 1, BTC: 64_000, ETH: 1_860, SOL: 74,
};
const FALLBACK_NGN_PER_USD = 1_400;

/**
 * Spread we earn on every trade, in percent.
 *
 * Default 3.5%. Sized to absorb, on a 15-minute locked quote:
 *   • coin volatility between quote and settlement   ~1–2%
 *   • bank/transfer + on-chain gas costs             ~0.2%
 *   • the gap between the P2P rate we quote and the
 *     rate we actually source liquidity at           ~1%
 * and still land under the 5–8% that Nigerian on-ramps typically charge.
 *
 * Card orders additionally pass the processor's fee through as a visible line
 * item, so this spread is never eaten by Paystack charges.
 */
export const SPREAD_PERCENT = clampNumber(process.env.EXCHANGE_SPREAD_PERCENT, 3.5, 0, 25);

/** How long a quote stays honoured once an order is created. */
export const QUOTE_TTL_MS = clampNumber(process.env.EXCHANGE_QUOTE_TTL_MINUTES, 15, 1, 120) * 60_000;

export const MIN_ORDER_NGN = clampNumber(process.env.EXCHANGE_MIN_NGN, 1_000, 100, 1_000_000);
export const MAX_ORDER_NGN = clampNumber(process.env.EXCHANGE_MAX_NGN, 5_000_000, 1_000, 1_000_000_000);

function clampNumber(raw: string | undefined, fallback: number, min: number, max: number): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.min(Math.max(n, min), max);
}

async function fetchJson<T>(url: string, init?: RequestInit, timeoutMs = 4000): Promise<T | null> {
  try {
    const res = await fetch(url, {
      ...init,
      signal: AbortSignal.timeout(timeoutMs),
      cache: "no-store",
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

// ─── Leg 1: coin → USD ──────────────────────────────────────────────────────

async function fetchBinanceUsd(): Promise<Record<string, number>> {
  const symbols = COINS.map((c) => c.binance).filter(Boolean) as string[];
  const query = encodeURIComponent(JSON.stringify(symbols));
  const data = await fetchJson<{ symbol: string; price: string }[]>(
    `https://api.binance.com/api/v3/ticker/price?symbols=${query}`
  );
  if (!Array.isArray(data)) return {};

  const out: Record<string, number> = {};
  for (const row of data) {
    const coin = COINS.find((c) => c.binance === row.symbol);
    const price = Number(row.price);
    if (coin && Number.isFinite(price) && price > 0) out[coin.symbol] = price;
  }
  return out;
}

async function fetchGecko(): Promise<Record<string, { usd?: number; ngn?: number }>> {
  const ids = COINS.map((c) => c.geckoId).join(",");
  const data = await fetchJson<Record<string, { usd?: number; ngn?: number }>>(
    `https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd,ngn`,
    undefined,
    5000
  );
  return data ?? {};
}

// ─── Leg 2: USD → NGN at the street rate ────────────────────────────────────

type BybitAdv = { price: string };
type BybitResponse = { result?: { items?: BybitAdv[] } };

/**
 * Median price of the live Bybit P2P USDT/NGN book — i.e. the rate a Nigerian
 * actually gets today. Median (not min) so a single troll ad can't move us.
 */
async function fetchBybitNgnRate(): Promise<number | null> {
  const data = await fetchJson<BybitResponse>(
    "https://api2.bybit.com/fiat/otc/item/online",
    {
      method: "POST",
      headers: { "Content-Type": "application/json", "User-Agent": "Mozilla/5.0" },
      body: JSON.stringify({ tokenId: "USDT", currencyId: "NGN", side: "1", page: "1", size: "20" }),
    },
    5000
  );

  const prices = (data?.result?.items ?? [])
    .map((i) => Number(i.price))
    .filter((p) => Number.isFinite(p) && p > 100 && p < 100_000)
    .sort((a, b) => a - b);

  if (prices.length < 3) return null;
  const mid = Math.floor(prices.length / 2);
  return prices.length % 2 === 0 ? (prices[mid - 1] + prices[mid]) / 2 : prices[mid];
}

// ─── Snapshot assembly ──────────────────────────────────────────────────────

type Cache = { snapshot: PricingSnapshot; at: number };
const g = globalThis as unknown as { __vpPricing?: Cache; __vpPricingInflight?: Promise<PricingSnapshot> };

/** Prices are re-fetched at most this often; the UI polls faster and rides the cache. */
const CACHE_TTL_MS = 10_000;

async function buildSnapshot(): Promise<PricingSnapshot> {
  const [binance, gecko, bybitRate] = await Promise.all([
    fetchBinanceUsd(),
    fetchGecko(),
    fetchBybitNgnRate(),
  ]);

  // Resolve the street NGN/USD rate, most-trustworthy source first.
  const envRate = Number(process.env.EXCHANGE_NGN_USD_RATE);
  let ngnPerUsd: number;
  let ngnRateSource: PricingSnapshot["ngnRateSource"];

  if (Number.isFinite(envRate) && envRate > 0) {
    // An explicit override always wins — lets you pin your true cost of funds.
    ngnPerUsd = envRate;
    ngnRateSource = "env";
  } else if (bybitRate) {
    ngnPerUsd = bybitRate;
    ngnRateSource = "bybit-p2p";
  } else if (gecko.tether?.ngn && gecko.tether.ngn > 0) {
    ngnPerUsd = gecko.tether.ngn;
    ngnRateSource = "coingecko";
  } else {
    ngnPerUsd = FALLBACK_NGN_PER_USD;
    ngnRateSource = "fallback";
  }

  const spread = SPREAD_PERCENT / 100;

  const coins: CoinPrice[] = COINS.map((c) => {
    let usd = binance[c.symbol];
    let source: PriceSource = "binance";

    if (!usd) {
      const g = gecko[c.geckoId]?.usd;
      if (g && g > 0) { usd = g; source = "coingecko"; }
    }
    if (!usd) { usd = FALLBACK_USD[c.symbol]; source = "fallback"; }

    const ngn = usd * ngnPerUsd;
    return {
      symbol: c.symbol,
      name: c.name,
      usd,
      ngn,
      buyNgn: ngn * (1 + spread),
      sellNgn: ngn * (1 - spread),
      source,
    };
  });

  return {
    coins,
    ngnPerUsd,
    ngnRateSource,
    spreadPercent: SPREAD_PERCENT,
    at: Date.now(),
    live: ngnRateSource !== "fallback" && coins.every((c) => c.source !== "fallback"),
  };
}

/** Cached, de-duplicated pricing snapshot. Concurrent callers share one fetch. */
export async function getPricing(): Promise<PricingSnapshot> {
  const cached = g.__vpPricing;
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.snapshot;

  if (g.__vpPricingInflight) return g.__vpPricingInflight;

  g.__vpPricingInflight = buildSnapshot()
    .then((snapshot) => {
      g.__vpPricing = { snapshot, at: Date.now() };
      return snapshot;
    })
    .catch((err) => {
      console.error("[pricing] snapshot failed:", err);
      if (cached) return cached.snapshot; // serve stale rather than nothing
      throw err;
    })
    .finally(() => { g.__vpPricingInflight = undefined; });

  return g.__vpPricingInflight;
}

export async function getCoin(symbol: string): Promise<CoinPrice | undefined> {
  const { coins } = await getPricing();
  return coins.find((c) => c.symbol === symbol.toUpperCase());
}

// ─── Card processing fees (Paystack, Nigerian cards) ────────────────────────
// 1.5% + ₦100, the ₦100 waived under ₦2,500, total capped at ₦2,000.
export function cardFeeNgn(amountNgn: number): number {
  if (amountNgn <= 0) return 0;
  const fee = amountNgn * 0.015 + (amountNgn >= 2500 ? 100 : 0);
  return Math.min(Math.round(fee * 100) / 100, 2000);
}

// ─── Quote construction (the only place money is computed) ──────────────────

export type BuyQuote = {
  coin: string;
  coinName: string;
  /** What the user typed they want to spend, before card fees. */
  amountNgn: number;
  /** Unique-per-order amount the user must actually transfer. */
  exactAmountNgn: number;
  cardFeeNgn: number;
  amountCrypto: number;
  rate: number;      // effective NGN per coin, spread included
  baseRate: number;  // mid-market NGN per coin
  spreadPercent: number;
  feeNgn: number;    // our spread earnings, in Naira
};

/**
 * Give every order a distinct kobo suffix (e.g. ₦20,000.37).
 *
 * Two customers paying "₦20,000" the same minute are indistinguishable in a
 * bank statement; ₦20,000.37 vs ₦20,000.84 are not. This is what makes manual
 * reconciliation in the admin queue unambiguous.
 */
function withUniqueKobo(amount: number): number {
  const kobo = Math.floor(Math.random() * 99) + 1; // .01 – .99
  return Math.floor(amount) + kobo / 100;
}

export async function quoteBuy(
  symbol: string,
  amountNgn: number,
  paymentMethod: "transfer" | "card"
): Promise<BuyQuote> {
  const coin = await getCoin(symbol);
  if (!coin) throw new Error(`Unsupported coin: ${symbol}`);

  const spend = Math.floor(amountNgn * 100) / 100;
  const exactAmountNgn = paymentMethod === "transfer" ? withUniqueKobo(spend) : spend;

  // Card orders are charged the processor fee on top, so the customer still
  // receives exactly the crypto their Naira amount buys.
  const fee = paymentMethod === "card" ? cardFeeNgn(spend) : 0;

  const amountCrypto = spend / coin.buyNgn;

  return {
    coin: coin.symbol,
    coinName: coin.name,
    amountNgn: spend,
    exactAmountNgn: paymentMethod === "card" ? spend + fee : exactAmountNgn,
    cardFeeNgn: fee,
    amountCrypto,
    rate: coin.buyNgn,
    baseRate: coin.ngn,
    spreadPercent: SPREAD_PERCENT,
    feeNgn: spend - amountCrypto * coin.ngn,
  };
}

export type SellQuote = {
  coin: string;
  coinName: string;
  amountCrypto: number;
  payoutNgn: number;
  rate: number;
  baseRate: number;
  spreadPercent: number;
  feeNgn: number;
};

export async function quoteSell(symbol: string, amountCrypto: number): Promise<SellQuote> {
  const coin = await getCoin(symbol);
  if (!coin) throw new Error(`Unsupported coin: ${symbol}`);

  const payoutNgn = Math.floor(amountCrypto * coin.sellNgn * 100) / 100;

  return {
    coin: coin.symbol,
    coinName: coin.name,
    amountCrypto,
    payoutNgn,
    rate: coin.sellNgn,
    baseRate: coin.ngn,
    spreadPercent: SPREAD_PERCENT,
    feeNgn: amountCrypto * coin.ngn - payoutNgn,
  };
}
