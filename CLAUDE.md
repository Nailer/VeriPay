# VeriPay

Escrow for online trade in Nigeria, built on Monad. Next.js app + Solidity contract + Supabase.

## Positioning — read this first

**The product is the escrow. The exchange is a feature.**

This gets confused easily because the exchange code is larger and newer. It isn't the business. The exchange exists for one reason: using the escrow required already owning MON, and almost nobody in Nigeria does. The naira on-ramp removes that barrier. When writing copy, docs, pitches or UI, lead with escrow and treat naira↔crypto as the thing that makes escrow reachable.

The market is Instagram / WhatsApp / Jiji commerce — people buying from strangers with no buyer protection — not crypto traders.

## Commands

```bash
npm run dev      # dev server
npm run build    # production build
npm run start    # serve the production build
npx tsc --noEmit # typecheck without touching .next
```

### The .next gotcha — this has broken things twice

Running `npm run build` while `npm run dev` is live **corrupts `.next`**. The symptom is bizarre and misleading: every *nested* API route 404s (`/api/admin/*`, `/api/exchange/*`, `/api/trades/*`) while single-level ones (`/api/chat`, `/api/track`) keep working. It once presented as "the admin passcode is wrong" because the login form couldn't reach its endpoint.

- Fix: `rm -rf .next` and restart.
- Prevention: stop the dev server before building, or use `npx tsc --noEmit` to typecheck.
- Dev mode is also the main reason the app "feels slow" — it recompiles per route and resets server-side module caches, so caches keep missing. Production is a different app: pages and `/api/exchange/rates` serve in ~3ms. **Always demo with `npm run build && npm run start`.**

## Architecture

```
src/app/
  page.tsx                     escrow landing
  create/                      open an escrow
  dashboard/                   list recent escrows (reads chain)
  trade/[id]/                  escrow detail — release, refund, dispute
  trade/[id]/chat/             per-trade chat
  exchange/                    exchange landing
  exchange/buy|sell/           order entry
  exchange/order/[id]/         order status, payment, support chat
  admin/                       passcode-gated console
  api/
    exchange/rates             live pricing
    exchange/orders            create + user actions (server-priced)
    exchange/card/{init,verify,webhook}   Paystack
    admin/{orders,chats,stats} admin data + fulfilment actions
    chat, notifications, track, trades/log

src/lib/
  abi.ts          v2 contract ABI + CONTRACT_ADDRESS
  escrow.ts       reads trades from EITHER contract version
  pricing.ts      server-authoritative pricing engine
  chainVerify.ts  on-chain verification of sell-side deposits
  exchangeStore.ts order persistence + lifecycle
  paystack.ts     card payments
  chatStore.ts    chat persistence
  usePolling.ts   visibility-aware polling hook
  supabase.ts     service-role client (server only)

contracts/VeriPayEscrow.sol   the escrow contract (deploy via Remix)
```

## Contract versions — important

Two versions exist in the wild:

- **v1 (legacy)** — `0xd0cc532f55ce6849d5b70e24d6188073f8921621` on Monad testnet. `trades()` returns **6 fields**. No fee, no disputes, no auto-release. Has ~14 historical trades.
- **v2 (`VeriPayEscrow.sol`)** — `trades()` returns **11 fields**. 1% fee on successful release only, disputes with arbitration, 7-day auto-release, 5% hard-coded fee ceiling.

`src/lib/escrow.ts` detects which is deployed (by calling `feeBps()`, which reverts on v1) and normalises both into one `EscrowTrade` shape with a `legacy: boolean` flag. **Always read trades through `readTrade()` / `readNextTradeId()` — never decode `trades()` directly**, or v1 data will fail to decode and the UI will silently render empty.

UI gates v2-only features (`Report a problem`, auto-release countdown, fee line, arbitration panel) behind `!trade.legacy`.

Deployment is via **Remix only** — there's no Hardhat/Foundry here. See `contracts/README.md`.

### v2 safety properties worth preserving

- The owner **cannot** touch escrowed funds. `withdrawFees` only moves `accruedFees`. Don't add an admin withdrawal of trade money.
- `MAX_FEE_BPS = 500` is a constant. Don't make it settable.
- Fee rate is locked per-trade at creation, so changing the global fee can't affect open trades.
- Refunds are never charged a fee. The platform earns only when a trade succeeds.

## Pricing engine (`src/lib/pricing.ts`)

All prices are computed **server-side**. The browser sends intent only (which coin, how much naira) — never a rate. A tampered request cannot mint a favourable price; this was a real hole that got closed.

Two legs:
1. **coin → USD** — Binance spot ticker, CoinGecko fallback (MON isn't on Binance).
2. **USD → NGN** — median of the live **Bybit P2P** order book.

Leg 2 matters more than it looks. CoinGecko's `ngn` price is the official CBN rate; the rate Nigerians actually transact at is the P2P street rate, which ran ~2% higher. Quoting the official rate while sourcing at the street rate loses money on every order. Resolution order: `EXCHANGE_NGN_USD_RATE` env → Bybit P2P → CoinGecko → constant.

Cached with **stale-while-revalidate** (serve immediately, refresh in background). A plain TTL cache equal to the client poll interval meant every request missed and blocked 1–3s on three upstream APIs.

Default spread **3.5%**. Card orders pass Paystack's fee (1.5% + ₦100, capped ₦2,000) to the customer as a separate line so it never eats the spread.

## Order lifecycle — nothing releases on a timer

```
BUY (transfer)  awaiting_payment → payment_review → [admin confirms] → completed / rejected
BUY (card)      awaiting_payment → [Paystack verified server-side] → verified → completed
SELL            awaiting_payment → [deposit proven on-chain] → verified → [admin pays NGN] → completed
```

Quotes lock for 15 minutes then `expired`. Expiry is the **only** automatic status change and it can only move an order backwards.

Reconciliation trick: every buy order gets a **unique kobo suffix** (₦20,000.14, not ₦20,000) so an admin can match a specific credit in a bank statement.

Sell deposits are verified by reading the tx from a Monad node — checks it exists, succeeded, went to our address, came from the order's wallet, and carries enough value. A unique index on `lower(tx_hash)` blocks replay.

Admin settlement actions use `transitionOrder()`, which puts the status guard in the SQL `WHERE` clause so concurrent double-clicks can't pay twice.

## Environment variables

Only `NEXT_PUBLIC_*` reaches the browser. Setting `CONTRACT_ADDRESS` instead of `NEXT_PUBLIC_CONTRACT_ADDRESS` silently does nothing — this has caught us before.

| Variable | Required | Purpose |
|---|---|---|
| `NEXT_PUBLIC_CONTRACT_ADDRESS` | yes | deployed VeriPayEscrow |
| `SUPABASE_SERVICE_ROLE_KEY` | yes | order/chat/analytics persistence |
| `ADMIN_PASSCODE` | yes | admin console gate |
| `NEXT_PUBLIC_THIRDWEB_CLIENT_ID` | yes | wallet connect |
| `EXCHANGE_SPREAD_PERCENT` | no (3.5) | margin |
| `EXCHANGE_NGN_USD_RATE` | no | pin true cost of funds |
| `EXCHANGE_QUOTE_TTL_MINUTES` | no (15) | quote lock |
| `EXCHANGE_MIN_NGN` / `EXCHANGE_MAX_NGN` | no | order limits |
| `EXCHANGE_MERCHANT_BANK_NAME`, `EXCHANGE_MERCHANT_ACCOUNT_NUMBER`, `EXCHANGE_MERCHANT_ACCOUNT_NAME` | no | account buyers pay into |
| `EXCHANGE_MERCHANT_ADDRESS` | no | where sellers send crypto |
| `EXCHANGE_PAYOUT_PRIVATE_KEY` | no | hot wallet; enables automatic crypto delivery |
| `PAYSTACK_SECRET_KEY` / `NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY` | no | live card payments |
| `MONAD_RPC_URL` | no | override testnet RPC |

Without Paystack keys the card flow runs in labelled TEST MODE and tags the order accordingly.

`.env` is gitignored. Never print secrets into chat output or commit them.

## Design rules

- **Strict black and white.** No accent colours anywhere — the pink `#FF007A` was deliberately removed. Use `zinc` shades, invert for dark mode.
- Logo is a check-mark-in-rounded-square (`src/components/Logo.tsx`, `src/app/icon.svg`).
- `font-black` uppercase labels, `rounded-3xl` cards, tracking-widest micro-labels.
- **Max 2–3 buttons per screen.** Flows should be obvious to someone who has never used crypto.
- **Mobile-first** — most users are on phones. Verify at 375px.
- Motion: keyframes in `globals.css` (`anim-fade-up`, `anim-scale-in`, `anim-shimmer`). Slow easing, `prefers-reduced-motion` respected.

### Performance rules learned the hard way

- No large blurred layers. A `blur-[120px]` element with `mix-blend-*` and `animate-pulse` re-rasterised a huge layer every frame. Ambient glow is now cheap radial gradients (`.bg-ambient`).
- Avoid `backdrop-blur-xl` on big cards; expensive on mobile for near-zero visual gain.
- Animate `transform`, not `background-position`.
- **All polling goes through `usePolling()`** — it pauses when the tab is hidden and stops when there's nothing left to poll (e.g. a settled order). Don't add raw `setInterval` fetches.
- Don't re-render a whole page once per second for a relative timestamp.

## Current state

- Monad **testnet** only. No real money has moved.
- No real users, no revenue.
- Naira payouts are manual; there's no bank API integration.
- Not licensed, contract not audited.
- Solo founder (Aje Emmanuel), sole owner. Started 11 April 2026.

Known gaps worth fixing: contract payouts are push (a contract recipient that reverts blocks settlement); the arbitrator is a single address; `README.md` still says "Monad Pay Lagos" and needs rebranding.

## YC context

This project is being submitted to **Y Combinator** (an equity investment, not a grant — they take ~7% for $500K). A previous application was rejected. The escrow-first framing above is the pitch. Draft application answers live in the conversation history, not the repo.

Honest read for anyone asked to help with the application: the weakest point is the lack of real transactions and users. Advice should push toward getting real trades through the product rather than polishing wording.

## Working style

- Verify changes by exercising them, not by assuming. Contract changes should be compiled and run against a local EVM before being handed over.
- When something is broken, find the actual cause before changing code — the admin-passcode incident was a 404 masquerading as an auth failure.
- Be straight about what is and isn't working. Don't describe testnet demos as if they were production.
