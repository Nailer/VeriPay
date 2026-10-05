# VeriPay — Monad Metropolis submission

**Track:** Consumer Products & Payments
**Live demo:** https://monad-pay-lagos-git-hackathon-metropolis-nailer1s-projects.vercel.app
**Network:** Monad testnet (chain 10143). No real money moves.
**Code:** https://github.com/Nailer/VeriPay (MIT) — the [README](./README.md) lists what existed before the hackathon and what was built during it, and discloses AI tool use.

## One line

Buyer protection for Instagram and WhatsApp shopping. A seller puts one link
in their bio; the buyer taps it, sees the seller's real track record, and pays
in naira with a fingerprint. The money is held until the order arrives. The
buyer never sees a wallet, a token or a gas fee.

## The problem

Most online retail in Nigeria happens between people who've never met. The
buyer won't pay first because vendors vanish with the money; the seller won't
ship first because buyers reverse transfers. VeriPay locks the payment in a
smart contract until the buyer confirms delivery.

But escrow alone answers "is my money safe?" It doesn't answer the question
buyers actually ask first: **"is this seller legit?"** Today that's answered
with screenshots of past "testimonials" — trivially faked.

## Why this needs Monad specifically

Every VeriPay trade writes a real on-chain event: created, released,
disputed, refunded. Replay those events and you get a seller's complete,
tamper-proof history — not a rating we assign, not a database row we could
quietly edit. Anyone can re-derive it from the chain.

That only works if writing an event on **every** trade is affordable,
including a ₦5,000 pair of sneakers. On a chain with meaningful fees, a
reputation system like this has to sample, batch, or move off-chain — and
then it's just a number someone controls again. Monad's near-zero fees and
fast finality are what make "every trade, on-chain, forever" practical.

Measured on the live testnet contract, not estimated:

- **Locking a payment confirms in about 1 second** (1.0–1.2s across our test
  runs). That is the difference between "paying" and "waiting for crypto" —
  a buyer standing at a checkout won't sit through a 15-second block.
- **The network cost of that lock is about ₦1** (≈0.02 MON), so we simply pay
  it for the buyer. On a chain where it cost ₦300, protecting a ₦2,000
  order would be absurd and the product could only serve big-ticket trades.
- The pay screen shows both numbers after every payment ("Secured in 1.1s ·
  network cost ₦0.94") — the only place the chain is visible at all.

## What was built during Metropolis (Sep 1 – Oct 13)

VeriPay existed before the hackathon as a basic escrow on Monad testnet.
Everything below is new in this window, on the `hackathon/metropolis` branch:

| Before | Built for Metropolis |
|---|---|
| Buyer needed a wallet, MON, and the seller's 0x address | **Seller payment links** (`/pay/yourshop`) — buyer pays **in naira by card**, signs in with a fingerprint, never sees crypto. Gas is paid for them. |
| Escrow in MON only | Escrow in **MON or AUSD** (Agora's dollar stablecoin) — new contract, `createTradeWithToken`, per-asset fee accounting |
| No way to check a seller | **On-chain seller reputation** — shown the moment a buyer pastes a seller's address, on every trade page, and at `/seller/[address]` |
| "Connect wallet" with seed phrases | **Passkey sign-in** (Face ID / fingerprint, no seed phrase) via Mera |
| Auto-release only if someone remembers to call it | **Chainlink CRE automation** that releases overdue trades on a schedule |
| Public RPC node (flaky under load) | **Alchemy** RPC across every client and server call |
| Old contract: no fees, no disputes | Deployed contract with 1% success-only fee, dispute arbitration, 7-day auto-release, 5% hard fee ceiling |

## Sponsor integrations

| Sponsor | How it's used | Where |
|---|---|---|
| **Agora — AUSD** | Escrow locks AUSD instead of volatile MON, so the agreed price is the paid price. Two-step approve → escrow flow in the UI. | `contracts/VeriPayEscrow.sol`, `src/app/create/page.tsx` |
| **Envio — HyperIndex** | Indexes every escrow event into per-address reputation. The app reads it via GraphQL; if the indexer is unreachable it falls back to reading the contract directly, with identical counting rules. | `indexer/`, `src/lib/reputation.ts` |
| **Monad Foundation — Mera** | Passkey accounts: the wallet is derived from the passkey's WebAuthn PRF output, so the same passkey gives the same address on any device. | `src/lib/mera.ts` |
| **Chainlink — CRE** | Cron workflow scans for trades past their release window and sends a signed report; `AutoReleaseReceiver` calls `autoRelease()` for each. | `cre/`, `contracts/cre/` |
| **Alchemy** | RPC for every read and write. | `src/lib/monad.ts` |

## Live deployments (Monad testnet)

| Contract | Address |
|---|---|
| VeriPayEscrow | `0x00bdf9fbc9f59cc6814bbc7a91b19bbad1517e6d` |
| AutoReleaseReceiver (CRE consumer) | `0x4bdff272df53a78887fd84a9ee9f4aa9a161a0b9` |
| AUSD (testnet) | `0x333a12e2B519DA16EBE75012d54574C16ef4463f` |
| vNGN — test naira (ours) | `0xdbb53d0a2d1b91ef6a41cf1128fef562ffc531eb` |

Trades #0–#4 are demo/test trades created by our own wallets so the
reputation features have real data to show (#3 and #4 are naira trades from
testing the pay-link flow). They're real on-chain transactions, not mocked —
but they're ours, not customers'.

**About vNGN.** The naira a buyer pays by card is represented on-chain by
vNGN, a test token we deployed ourselves (`contracts/test/VeriPayTestNaira.sol`).
After Paystack confirms the (test-mode) card charge server-side, exactly that
amount is issued to the buyer and locked in escrow. It is a stand-in, not
money: on mainnet this slot is filled by a regulated stablecoin (a licensed
naira stablecoin, or AUSD) — the escrow contract already accepts any ERC-20,
so nothing in the contract changes.

## Try it yourself

1. Open the live demo link above.
2. **The main flow — get paid like a shop.** Tap *Get your payment link*,
   sign in with your fingerprint, pick a shop name. You get a link like
   `/pay/yourshop`. Open it on a second phone/browser (a seller can't pay
   their own link), enter an amount in naira and what's being bought, and pay
   with Paystack's test card `4084 0840 8408 4081` (any future expiry, CVV
   `408`). The money is locked for the seller in about a second.
3. **Check a seller:** tap *Check a seller* on the home page and paste
   `0xEfD0497f4557b49E84369cfb884B6c7446e11aBA`. You'll see 3 paid out,
   0 disputes, 4 trades (our own demo trades) — every one clickable through to its on-chain detail.
4. **Same check, at the moment it matters:** tap *Start Escrow* and paste that
   same address as the seller. The record appears before you commit any money.
5. **Passkey sign-in:** tap the fingerprint icon next to *Sign in* on a phone
   or laptop with Face ID / Touch ID / Windows Hello. A wallet is created from
   the passkey — no seed phrase.
6. **Pay in dollars:** on *Start Escrow*, switch the toggle to **AUSD**. You'll
   be asked to approve AUSD first, then lock it. (Needs testnet AUSD in the
   wallet.)
7. **Auto-release:** open trade #2 — it shows the countdown until the seller
   can be paid without the buyer. The Chainlink workflow releases it once that
   passes.

## Honest limitations

- Testnet only. The contract hasn't been audited.
- Pay links run on test money end to end: Paystack is in test mode and vNGN
  is our own test token. A seller's "received" balance can't be withdrawn to
  a bank yet — that needs a licensed stablecoin/off-ramp partner and a
  registered business.
- The CRE workflow runs through Chainlink's simulator (`cre workflow
  simulate --broadcast`), which makes real testnet writes through Chainlink's
  mock forwarder. A production CRE deployment needs Chainlink's deploy access;
  switching is one `setForwarderAddress` call, no redeploy.
- Dispute arbitration is a single admin address today — a known
  centralisation point.
- Naira payouts on the exchange side are still settled manually.
