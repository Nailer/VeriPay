# VeriPay Exchange — how it works

Naira ⇄ crypto on-ramp/off-ramp, built so neither side has to trust the other's word.

## Pricing

Every price is computed on the **server**. The browser only says *which coin* and *how much
Naira* — it never sends a rate, so a tampered request can't mint a favourable price.

A Naira price is two independent numbers multiplied together:

| Leg | Source | Why |
|---|---|---|
| coin → USD | Binance spot ticker (CoinGecko for MON) | real-time, sub-second |
| USD → NGN | **Bybit live P2P order book** (median of top 20 ads) | the *street* rate |

The second row is the one that matters. CoinGecko's `ngn` price uses the official CBN rate
(~₦1,368/$); the rate Nigerians actually transact at on Bybit/Binance P2P is currently
~₦1,392/$. Quoting the official rate while sourcing liquidity at the street rate loses
money on **every** order. We price off the same book Bybit shows.

Resolution order for the NGN rate: `EXCHANGE_NGN_USD_RATE` env override → Bybit P2P →
CoinGecko USDT/NGN → hard fallback.

### Spread

Default **3.5%** (`EXCHANGE_SPREAD_PERCENT`). Sized to absorb, over a 15-minute locked quote:

- coin volatility between quote and settlement — ~1–2%
- bank transfer + on-chain gas — ~0.2%
- gap between the rate we quote and our true cost of funds — ~1%

…and still sit under the 5–8% typical of Nigerian on-ramps. Card orders pass Paystack's
fee (1.5% + ₦100, capped ₦2,000) through as a **separate visible line item**, so the
spread is never eaten by processor charges.

### Rate locking

A quote is honoured for 15 minutes (`EXCHANGE_QUOTE_TTL_MINUTES`), with a live countdown on
the order page. Unpaid orders then **expire** — we are never bound to a stale rate. Expiry
is the only automatic status change in the system, and it can only move an order backwards.

## Order lifecycle

Nothing releases on a timer. Value moves only when a payment is positively confirmed.

```
BUY · bank transfer
  awaiting_payment ──user declares payment──▶ payment_review
                                                   │
                    admin matches bank statement   │   admin rejects
                                                   ▼
                                          completed / rejected

BUY · card
  awaiting_payment ──Paystack verifies the charge──▶ verified ──▶ completed   (no admin)

SELL
  awaiting_payment ──deposit proven on-chain──▶ verified ──admin pays NGN──▶ completed
```

### How the admin knows a buyer really paid

Each order carries a **unique kobo suffix** — ₦20,000.14, not ₦20,000. Two customers paying
"₦20,000" in the same minute are indistinguishable in a bank statement; ₦20,000.14 and
₦20,000.83 are not. The fulfilment queue shows, on one card:

- the exact figure to look for, plus the reference/narration
- the account name the customer declared paying from
- **what to send** — the crypto amount and destination address, both one-tap copyable
- the locked rate, your margin in Naira, and how far the market has drifted since

Confirming is a single button. With `EXCHANGE_PAYOUT_PRIVATE_KEY` set the crypto goes out
automatically; without it you send manually and paste the hash. Double-clicking can't pay
twice — the status guard lives in the SQL `WHERE` clause, so the second write matches no rows.

### How the sell leg avoids trust entirely

When a user submits a deposit we read the transaction from a Monad RPC node and check it
ourselves: it exists, it succeeded, it went to **our** address, it carries at least the
expected value, and it came from the wallet that opened the order. A unique index on
`lower(tx_hash)` stops one deposit settling several orders.

A real, confirmed Monad transaction that simply wasn't sent to us is rejected.

## Configuration

| Variable | Required | Purpose |
|---|---|---|
| `SUPABASE_SERVICE_ROLE_KEY` | yes | order/chat persistence |
| `ADMIN_PASSCODE` | yes | admin console gate |
| `EXCHANGE_SPREAD_PERCENT` | no (3.5) | your margin |
| `EXCHANGE_NGN_USD_RATE` | no | pin your true cost of funds, overrides the live P2P rate |
| `EXCHANGE_QUOTE_TTL_MINUTES` | no (15) | how long a quote is honoured |
| `EXCHANGE_MIN_NGN` / `EXCHANGE_MAX_NGN` | no | order limits |
| `EXCHANGE_MERCHANT_BANK_NAME`, `EXCHANGE_MERCHANT_ACCOUNT_NUMBER`, `EXCHANGE_MERCHANT_ACCOUNT_NAME` | no | the account buyers pay into |
| `EXCHANGE_MERCHANT_ADDRESS` | no | where sellers send crypto |
| `EXCHANGE_PAYOUT_PRIVATE_KEY` | no | funded hot wallet; enables automatic crypto delivery |
| `PAYSTACK_SECRET_KEY` | no | live card payments (server-side verification) |
| `NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY` | no | card checkout popup |
| `MONAD_RPC_URL` | no | override the default testnet RPC |

Without Paystack keys the card flow runs in clearly-labelled **TEST MODE** and tags the
order `TEST MODE card charge — no real money moved`, so it demos end-to-end without
pretending a real charge happened.

Point the Paystack webhook at `https://<your-domain>/api/exchange/card/webhook` — it's the
safety net if a customer closes the tab mid-payment.
