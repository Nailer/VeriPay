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
  escrow.ts       reads trades from EITHER contract version (dashboard, trade detail, trade chat)
  monad.ts        thirdweb chain + contract + sendTransaction helpers — see "Sending transactions" below
  pricing.ts      server-authoritative pricing engine
  chainVerify.ts  on-chain verification of sell-side deposits
  exchangeStore.ts order persistence + lifecycle
  paystack.ts     card payments
  chatStore.ts    chat persistence
  usePolling.ts   visibility-aware polling hook
  supabase.ts     service-role client (server only)

src/components/
  ArbitrationPanel.tsx   admin dispute-resolution UI (Admin console → Disputes tab)

contracts/VeriPayEscrow.sol   the escrow contract (deploy via Remix)
```

## Contract versions — important

Two versions exist in the wild:

- **v1 (legacy)** — `0xd0cc532f55ce6849d5b70e24d6188073f8921621` on Monad testnet. `trades()` returns **6 fields**. No fee, no disputes, no auto-release. Has ~14 historical trades.
- **v2 (`VeriPayEscrow.sol`)** — `trades()` returns **11 fields**. 1% fee on successful release only, disputes with arbitration, 7-day auto-release, 5% hard-coded fee ceiling.

`src/lib/escrow.ts` detects which is deployed (by calling `feeBps()`, which reverts on v1) and normalises both into one `EscrowTrade` shape with a `legacy: boolean` flag. **Always read trades through `readTrade()` / `readNextTradeId()` — never decode `trades()` directly**, or v1 data will fail to decode and the UI will silently render empty.

UI gates v2-only features (`Report a problem`, auto-release countdown, fee line, arbitration panel) behind `!trade.legacy`.

**As of now, v2 is NOT deployed.** `NEXT_PUBLIC_CONTRACT_ADDRESS` is unset, so the live site runs on the v1 fallback address — no fee, no disputes, no arbitration, even though all of that UI exists and is fully wired. Deploying v2 and setting the env var is what turns it on; nothing else needs to change. Don't tell anyone (users, investors, docs) that fees or disputes are live until this is actually done — see `contracts/README.md` for the Remix steps.

Deployment is via **Remix only** — there's no Hardhat/Foundry here.

### v2 safety properties worth preserving

- The owner **cannot** touch escrowed funds. `withdrawFees` only moves `accruedFees`. Don't add an admin withdrawal of trade money.
- `MAX_FEE_BPS = 500` is a constant. Don't make it settable.
- Fee rate is locked per-trade at creation, so changing the global fee can't affect open trades.
- Refunds are never charged a fee. The platform earns only when a trade succeeds.

## Sending transactions — use thirdweb, never `window.ethereum`

Every write (create trade, release, refund, raise/resolve dispute, sell-side MON transfer) goes through `src/lib/monad.ts`: `prepareContractCall` / `prepareTransaction` + `sendTransaction({ account, transaction })` + `waitForReceipt`, where `account` comes from `useActiveAccount()`.

This used to be done with `window.ethereum.request(...)` + a raw viem `createWalletClient`. **That silently breaks for most real users** — `window.ethereum` only exists for browser-extension wallets. It's `undefined` for thirdweb's in-app (email/social login) wallet and for wallets connected over WalletConnect, which covers most people on mobile. The symptom was "No browser wallet detected. Please install MetaMask." on every write action, for anyone not using a desktop extension — found and fixed across `create/page.tsx`, `trade/[id]/page.tsx`, `exchange/order/[id]/page.tsx`, and `ArbitrationPanel.tsx`.

thirdweb's own pipeline works uniformly across every connection type and switches/adds Monad Testnet on the wallet automatically — the manual `wallet_switchEthereumChain` / `wallet_addEthereumChain` dance is gone and shouldn't come back. **If you add a new write action, use `escrowContract` + `prepareContractCall` from `monad.ts`, not `window.ethereum`.**

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

Without Paystack keys the card flow runs in labelled TEST MODE and tags the order accordingly. Paystack test keys are confirmed working end-to-end (real checkout URL, real access code, `configured: true`) — the card flow is not theoretical, it's tested. Going live only needs a Paystack live-mode application, which needs a registered business.

`.env` is gitignored. Never print secrets into chat output or commit them. Watch for near-miss variable names — a past bug had `_ACCOUNT_NUMBER`/`_ACCOUNT_NAME` instead of `EXCHANGE_MERCHANT_ACCOUNT_NUMBER`/`EXCHANGE_MERCHANT_ACCOUNT_NAME`, which silently fell back to fake bank details shown to real buyers. If bank details on the buy flow ever look wrong, check the exact env var names first, both locally and on Vercel — they're two separate places and can drift out of sync.

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

- Live at **veripay.store** (custom domain, DNS on Namecheap pointed at Vercel, valid SSL, confirmed HTTP 200). The `.vercel.app` URL still works alongside it. All hardcoded references to the old `monad-pay-lagos.vercel.app` URL have been fixed and pushed (`README.md`, `docs/docs.json` navbar "Launch App" button, `src/components/Navbar.tsx` thirdweb `ConnectButton` `appMetadata.url` on both desktop and mobile). If a thirdweb client-ID allowed-domains list exists on the thirdweb dashboard, confirm `veripay.store` is on it — not yet verified either way.
- Monad **testnet** only. No real money has moved.
- **v2 contract (fee + disputes + arbitration) is built, locally EVM-tested (27/27 passing), and fully wired into the UI — but not deployed.** `NEXT_PUBLIC_CONTRACT_ADDRESS` is still unset, so the live site runs on the v1 fallback address with no fee and no disputes. See the "Contract versions" section above — deploying v2 via Remix and setting the env var is the single next step that turns all of this on.
- Card payments via Paystack are confirmed working end-to-end in **test mode** (real checkout URL, real access code returned). Going live needs a live-mode Paystack application, which needs a registered business — not done yet.
- Mobile wallet transactions (in-app/email-login wallets, WalletConnect) were broken until the `window.ethereum` → thirdweb fix described above; now fixed and verified across all four write-action pages.
- No real users, no revenue, no live transactions yet on either the escrow or the exchange.
- Naira payouts are manual; there's no bank API integration.
- Not licensed, no legal entity formed yet, contract not audited.
- Solo founder (Aje Emmanuel), sole owner. Started 11 April 2026.
- Submitted a **Y Combinator** application (see "YC context" below) with escrow-first framing, a founder-introduction video, and a demo video/script prepared for Arcade.app editing. Also pitched at a **local investor event** the same period (see "Fundraising tracks" below) using a 10-slide Gamma.app deck.

Known gaps worth fixing, in rough priority order: (1) deploy v2 to get fee/dispute/arbitration actually live; (2) get a security review before real funds move — contract is untested by anyone but the founder; (3) form a legal entity — blocks Paystack going live and any real fundraising close; (4) contract payouts are push-based (a recipient contract that reverts blocks settlement — no pull-payment fallback exists); (5) the arbitrator is a single address — centralization risk worth flagging honestly to investors; (6) no sizing yet on how much float the exchange needs to hold to avoid delayed payouts at volume.

## Fundraising tracks — two separate, concurrent efforts

Don't conflate these; they're different instruments for different audiences.

1. **Y Combinator** — equity investment, not a grant (~7% for $500K, standard YC deal). A previous application was rejected; this is a second attempt. The escrow-first framing above is the pitch. Draft answers to the full YC question set (traction, monetization, equity split, "how far along," founder video script, "what convinced you to apply") were worked through in prior conversation history, not stored in the repo. Honest read: the weakest point is still the lack of real transactions and users — advice for this track should keep pushing toward getting real trades through the product, not polishing wording further.
2. **Local pre-seed (Nigeria)** — a smaller, separate raise pitched at a local investor event, structured as a **SAFE** (~$60,000 target) rather than a priced round, sized around: a testnet-to-mainnet + security review budget, few months of runway for the founder full-time, and a small marketing/liquidity push to get first real trades flowing. No valuation cap has been set — that needs real legal counsel before it's put in front of an investor, and shouldn't be invented on the founder's behalf. A 10-slide Gamma.app deck was built for this pitch, ending on an ask slide built from this reasoning and including the monetization paragraph originally drafted for the YC "how will you make money" answer.

## Working style

- Verify changes by exercising them, not by assuming. Contract changes should be compiled and run against a local EVM before being handed over.
- When something is broken, find the actual cause before changing code — the admin-passcode incident was a 404 masquerading as an auth failure.
- Be straight about what is and isn't working. Don't describe testnet demos as if they were production.
