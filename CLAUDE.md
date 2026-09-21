# VeriPay

Escrow for online trade in Nigeria, built on Monad. Next.js app + Solidity contract + Supabase.

## Positioning — read this first

**The product is the escrow. The exchange is a feature.**

This gets confused easily because the exchange code is larger and newer. It isn't the business. The exchange exists for one reason: using the escrow required already owning MON, and almost nobody in Nigeria does. The naira on-ramp removes that barrier. When writing copy, docs, pitches or UI, lead with escrow and treat naira↔crypto as the thing that makes escrow reachable.

The market is Instagram / WhatsApp / Jiji commerce — people buying from strangers with no buyer protection — not crypto traders.

## Hackathon branch — `hackathon/metropolis`

VeriPay is entering Monad's **Metropolis** hackathon (Sep 1 – Oct 13, $250K pool, track: **Consumer Products & Payments** — "make blockchain invisible to the end user," which is VeriPay's whole premise). All hackathon-specific work happens on `hackathon/metropolis`, kept deliberately separate from `main` — `main` is what's live at veripay.store for real (if early) users, and nothing here should reach production without a deliberate decision to merge it.

Rule the hackathon requires: since VeriPay already existed before the hackathon, only work *actually built during the Sep 1 – Oct 13 window* counts toward the submission. The demo has to show what's new, not just what already existed.

**The core hackathon thesis — "why does this need Monad specifically":** before this branch, Monad was infrastructure detail — the app didn't visibly need Monad's speed or near-zero fees over any other chain. The fix is a public, on-chain **reputation** feed (see "Reputation" below): it's only viable because Monad's fees are cheap enough to write a real event on every trade, and it's only trustworthy because it's derived from those events rather than a number VeriPay could quietly edit.

Five sponsor bounty integrations, chosen for genuine product fit over easy bounty-chasing:
1. **Agora (AUSD stablecoin)** — contract deployed and live (see "Contract versions" below), and wired all the way into the UI: a MON/AUSD toggle on the create-escrow page does the real two-step approve-then-escrow flow, and every page that displays a trade amount (`formatTradeAmount()` in `escrow.ts`) is asset-aware, not just the create form.
2. **Monad Foundation (Mera passkey)** — done. Face ID/fingerprint sign-in, no seed phrase. See "Passkey sign-in" below.
3. **Envio (HyperIndex)** — indexer built (see `indexer/`), not yet deployed to Envio's hosted service — needs the founder's Envio account (sign-up in progress).
4. **Chainlink (CRE)** — built, not deployable without a Chainlink account. Automates the 7-day auto-release instead of relying on a human to call it. See "CRE auto-release automation" below.
5. **Alchemy** — live. `NEXT_PUBLIC_MONAD_RPC_URL` is set to the founder's real Alchemy Monad-testnet endpoint (verified directly — `eth_chainId` returns `10143`, and it correctly reads the deployed escrow contract) on this branch's Preview deployments and in local `.env`. Not set on `main`/production, which still uses the public node.

**Testable preview:** `https://monad-pay-lagos-git-hackathon-metropolis-nailer1s-projects.vercel.app` — a stable alias that updates automatically on every push to this branch, entirely separate from veripay.store/production. Vercel's SSO/login protection was disabled project-wide (`vercel project protection disable monad-pay-lagos --sso`) so this link is openly viewable — worth knowing if that project-level setting ever needs revisiting, since it now applies to every preview deployment on this project, not just this branch's.

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
  install/                     PWA install walkthrough (iOS / Android / desktop)
  manifest.ts                  web app manifest (Next native route → /manifest.webmanifest)
  api/
    exchange/rates             live pricing
    exchange/orders            create + user actions (server-priced)
    exchange/card/{init,verify,webhook}   Paystack
    admin/{orders,chats,stats} admin data + fulfilment actions
    push/{subscribe,unsubscribe,resubscribe}   web push subscription management
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
  push.ts         server-side web push sends (VAPID) — see "Push notifications" below
  pushClient.ts   browser-side subscribe/unsubscribe helpers

src/components/
  ArbitrationPanel.tsx   admin dispute-resolution UI (Admin console → Disputes tab)
  InstallPrompt.tsx      dismissible "install this as an app" banner
  ServiceWorkerRegister.tsx   registers public/sw.js (production only)

public/
  sw.js           service worker — offline app-shell fallback + push/notificationclick handlers
  icons/          manifest + apple-touch-icon PNGs, generated from src/app/icon.svg

contracts/VeriPayEscrow.sol   the escrow contract (deploy via Remix)
```

## Contract versions — important

On `main`, two versions exist in the wild:

- **v1 (legacy)** — `0xd0cc532f55ce6849d5b70e24d6188073f8921621` on Monad testnet. `trades()` returns **6 fields**. No fee, no disputes, no auto-release. Has ~14 historical trades.
- **v2 (`VeriPayEscrow.sol`)** — `trades()` returns **11 fields**. 1% fee on successful release only, disputes with arbitration, 7-day auto-release, 5% hard-coded fee ceiling.

**On `hackathon/metropolis`, `VeriPayEscrow.sol` has a third field appended — field 11, `token`** (`address(0)` = native MON, otherwise an ERC-20 like Agora's AUSD — see `createTradeWithToken`). `accruedFees`, `escrowedBalance` and `withdrawFees` all take a token address now, tracked per-asset so a MON fee and an AUSD fee never mix. The native-MON path is byte-for-byte unchanged — verified with 22/22 passing local-EVM tests (regression + full token lifecycle). `abi.ts` and `escrow.ts` on this branch are updated to match; don't merge this branch's contract changes back to `main` without also carrying those two files.

`src/lib/escrow.ts` detects which is deployed (by calling `feeBps()`, which reverts on v1) and normalises both into one `EscrowTrade` shape with a `legacy: boolean` flag. **Always read trades through `readTrade()` / `readNextTradeId()` — never decode `trades()` directly**, or v1 data will fail to decode and the UI will silently render empty.

UI gates v2-only features (`Report a problem`, auto-release countdown, fee line, arbitration panel) behind `!trade.legacy`.

**On `hackathon/metropolis`, the AUSD-extended contract is now deployed and live**, at `0x00bdf9fbc9f59cc6814bbc7a91b19bbad1517e6d` on Monad testnet — `NEXT_PUBLIC_CONTRACT_ADDRESS` in `.env` points at it (this also fixed a real pre-existing bug: the var was named `CONTRACT_ADDRESS`, missing the `NEXT_PUBLIC_` prefix, so nothing had ever actually been read from it by client code before this). Deployed via a throwaway key generated for this one purpose; independently verified on-chain (not just trusted the deploy script's own output) — `owner()`, `arbitrator()`, `feeRecipient()` all read back as the founder's real wallet (`0xEfD0497f4557b49E84369cfb884B6c7446e11aBA`), `feeBps()` reads `100` (1%), `autoReleaseDelay()` reads `604800` (7 days). The throwaway key has been deleted from disk — it holds no privilege on the contract anymore and its leftover testnet MON is inconsequential.

**On `main`, nothing past v1 is deployed** — that branch's `NEXT_PUBLIC_CONTRACT_ADDRESS` is still unset, so production (veripay.store) still runs on the v1 fallback with no fee, no disputes, no AUSD. Don't conflate the two branches: don't tell anyone (users, investors, docs) that fees/disputes/AUSD are live on the actual product until this branch's contract work is deliberately merged to `main` — that's a separate decision from getting it working for the hackathon demo.

Deployment is via **Remix only** — there's no Hardhat/Foundry here.

### Contract safety properties worth preserving

- The owner **cannot** touch escrowed funds. `withdrawFees` only moves `accruedFees`. Don't add an admin withdrawal of trade money.
- `MAX_FEE_BPS = 500` is a constant. Don't make it settable.
- Fee rate is locked per-trade at creation, so changing the global fee can't affect open trades.
- Refunds are never charged a fee. The platform earns only when a trade succeeds.
- ERC-20 trades pull funds via `transferFrom` (buyer must approve first) and pay out via `transfer` — both checked with `require(...)`, since some tokens return `false` instead of reverting on failure.

## Sending transactions — use thirdweb, never `window.ethereum`

Every write (create trade, release, refund, raise/resolve dispute, sell-side MON transfer) goes through `src/lib/monad.ts`: `prepareContractCall` / `prepareTransaction` + `sendTransaction({ account, transaction })` + `waitForReceipt`, where `account` comes from `useActiveAccount()`.

This used to be done with `window.ethereum.request(...)` + a raw viem `createWalletClient`. **That silently breaks for most real users** — `window.ethereum` only exists for browser-extension wallets. It's `undefined` for thirdweb's in-app (email/social login) wallet and for wallets connected over WalletConnect, which covers most people on mobile. The symptom was "No browser wallet detected. Please install MetaMask." on every write action, for anyone not using a desktop extension — found and fixed across `create/page.tsx`, `trade/[id]/page.tsx`, `exchange/order/[id]/page.tsx`, and `ArbitrationPanel.tsx`.

thirdweb's own pipeline works uniformly across every connection type and switches/adds Monad Testnet on the wallet automatically — the manual `wallet_switchEthereumChain` / `wallet_addEthereumChain` dance is gone and shouldn't come back. **If you add a new write action, use `escrowContract` + `prepareContractCall` from `monad.ts`, not `window.ethereum`.**

## Passkey sign-in (`hackathon/metropolis` only)

`src/lib/mera.ts` wraps Category Labs' `@category-labs/mera` (Monad Foundation's passkey-onboarding bounty) into a thirdweb `Wallet`, surfaced as a fingerprint-icon button beside "Sign in" in the Navbar (`PasskeyButton`, only rendered when no wallet is connected and the browser supports WebAuthn). The account is derived deterministically from the passkey's WebAuthn PRF output — same passkey, same 32-byte seed, same address, on any device that has it. No seed phrase, no email/OTP hop.

**Don't use `viemAdapter.wallet.fromViem` to wrap it**, even though that's what mera's own docs and thirdweb's docs both point to — it proxies raw EIP-1193 `.request()` calls straight to the transport, which is correct for a real injected provider (MetaMask) but not for a derived local key over a plain RPC transport, which doesn't understand wallet-specific methods like `eth_sendTransaction`. That's the exact "No browser wallet detected" bug class this project already hit once (see "Sending transactions" above) — it would silently fail to sign anything. The working pattern, verified by reading thirdweb's own adapter source rather than trusting the docs: build the `Account` object by hand using viem's proper signing Actions (`walletClient.sendTransaction(...)`, `.signMessage(...)`, `.signTypedData(...)`), then wrap that with `createWalletAdapter` from `thirdweb/wallets`. `mera.ts`'s doc comment has the full reasoning.

## Reputation indexer (`hackathon/metropolis` only)

`indexer/` is a separate Envio HyperIndex project (own `package.json`, deploys independently — see `indexer/README.md`) that turns the escrow contract's own events into a public, per-address reputation figure: completed trades, disputes, refunds. It's the answer to "why does this need Monad" for the hackathon — Monad's near-zero fees make writing a real event on every trade affordable regardless of trade size, and because the numbers are derived purely from those events (not a score VeriPay stores and could edit), anyone can independently re-verify them straight from the chain.

`src/app/api/reputation/[address]/route.ts` queries the indexer's GraphQL endpoint (`ENVIO_GRAPHQL_URL` env var — unset means `configured: false`, not an error) and `src/components/ReputationBadge.tsx` renders it, currently wired into the seller card on the trade detail page. Renders nothing for an address with no history, so a fresh address isn't shown a discouraging "0 trades" badge.

**Not yet tested against a live contract** — the indexer's `config.yaml`/`schema.graphql`/`src/EventHandlers.ts` pass `envio codegen` + `tsc --noEmit` cleanly, but real end-to-end verification needs the contract deployed (for a real address to index) and either Docker (local `envio dev`) or an Envio hosted deployment (`envio deploy`, needs an account/API token from <https://envio.dev/app/api-tokens>) — neither was available in the environment this was built in.

## CRE auto-release automation (`hackathon/metropolis` only)

Closes a real reliability gap: today, `autoRelease()` on the escrow only fires if a human remembers to call it after a buyer's confirmation window passes. A Chainlink CRE cron workflow checks recent trades every 15 minutes and triggers release for anything genuinely due.

Two halves, on-chain and off-chain:

- **`contracts/cre/`** — `AutoReleaseReceiver.sol` receives a signed CRE report (a batch of trade ids) and calls `autoRelease(id)` on each via try/catch, so one already-settled trade in a batch never blocks the rest. `ReceiverTemplate.sol`/`IReceiver.sol`/`IERC165.sol` are vendored **verbatim** from Chainlink's own `cre-templates` repo (`starter-templates/keeper-bot`) — that's the security-critical signature/sender-verification layer, not something to hand-roll from a docs description. Locally EVM-tested, 10/10 passing: authorized-forwarder success, unauthorized-sender rejection, batch partial-failure resilience, forwarder rotation. Holds no funds and needs no special permission on VeriPayEscrow — `autoRelease()` is already `external`, callable by anyone; this contract just calls it on a schedule instead of by hand.
- **`cre/`** — the workflow itself (`workflow.ts` + `main.ts`), written against `@chainlink/cre-sdk`'s real installed types (verified by reading `node_modules`, not guessed from docs — the docs' own suggested high-level pattern turned out to need a CLI codegen step this was built without, so this uses the lower-level `evmClient.callContract`/`runtime.report`/`evmClient.writeReport` primitives directly). Passes `tsc --noEmit` against the real SDK.

**Not deployable without a Chainlink CRE account** — the CLI needs "deploy access" requested from Chainlink, and CRE workflows compile to WASM and run inside a DON's TEE, so there's no local way to actually execute one end-to-end here. `cre/README.md` has the real remaining steps.

## PWA — install + push notifications

VeriPay isn't distributed through an app store; it installs as a Progressive Web App straight from `veripay.store` (manifest + service worker + home-screen icons). `src/app/install/page.tsx` walks users through it per-platform, and `InstallPrompt.tsx` surfaces a dismissible one-line nudge site-wide (native install prompt on Android/Chrome/desktop via `beforeinstallprompt`; Share → Add to Home Screen instructions on iOS, which never fires that event).

**Push notifications are a separate opt-in from installing the app.** The existing in-app bell (`notifications` table, polled every 20s) only works while a tab is open. Real device notifications — the kind that show up with the screen off — go through the Web Push API:

- `src/lib/pushClient.ts` (browser): requests `Notification` permission, subscribes via `PushManager` using `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, POSTs the subscription to `/api/push/subscribe` keyed by the connected wallet address (lowercased, same key as `notifications.to_address`). Wired into the Navbar's notification-bell panel as an "Enable Device Alerts" toggle — only shown once a wallet is connected.
- `push_subscriptions` table in Supabase (`address`, `endpoint` unique, `p256dh`, `auth`) — one row per browser/device, upserted on `endpoint` conflict so re-subscribing doesn't duplicate rows.
- `src/lib/push.ts` (server): `sendPushToAddress()` looks up every subscription for an address and calls `web-push`'s `sendNotification`. Hooked into the existing `POST /api/notifications` handler — every trade/chat notification that already gets written to the bell also fires a best-effort push, wrapped so a push failure never breaks the request. Expired subscriptions (404/410 from the push service) are pruned automatically.
- `public/sw.js` handles `push` (shows the notification), `notificationclick` (focuses/opens the right trade), and `pushsubscriptionchange` (re-subscribes and calls `/api/push/resubscribe` to carry the address forward if the browser rotates the subscription).

**Deliberately not cached:** the service worker's `fetch` handler only intercepts page navigations (for the offline fallback screen). `/api/*` — pricing, escrow reads, chat, orders — is never touched by the cache, so a stale price or trade status can never be served offline. Don't change this without re-reading the "Pricing engine" section below on why staleness here is a real financial bug, not a UX nit.

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
| `NEXT_PUBLIC_MONAD_RPC_URL` | no | RPC endpoint for both client and server (e.g. Alchemy's `https://monad-testnet.g.alchemy.com/v2/KEY` — Alchemy hackathon bounty). Falls back to the public node. Client-exposed by design; restrict it to veripay.store in Alchemy's dashboard. |
| `MONAD_RPC_URL` | no | server-only override, if the server ever needs a different endpoint than the client — otherwise leave unset and just set the `NEXT_PUBLIC_` one |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` | no | web push (device notifications); without both, push silently no-ops |
| `VAPID_SUBJECT` | no (`mailto:support@veripay.store`) | contact URI push services may use to reach the app owner |

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
