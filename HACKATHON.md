# VeriPay — Monad Metropolis submission

**Track:** Consumer Products & Payments
**Live demo:** https://monad-pay-lagos-git-hackathon-metropolis-nailer1s-projects.vercel.app
**Network:** Monad testnet (chain 10143). No real money moves.

## One line

Escrow for buying from strangers on Instagram and WhatsApp — and before you
pay, you can see the seller's real track record, read straight off Monad.

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

## What was built during Metropolis (Sep 1 – Oct 13)

VeriPay existed before the hackathon as a basic escrow on Monad testnet.
Everything below is new in this window, on the `hackathon/metropolis` branch:

| Before | Built for Metropolis |
|---|---|
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

Trades #0–#2 are demo trades created by our own test wallet so the reputation
features have real data to show. They're real on-chain transactions, not
mocked — but they're ours, not customers'.

## Try it yourself

1. Open the live demo link above.
2. **Check a seller:** tap *Check a seller* on the home page and paste
   `0xEfD0497f4557b49E84369cfb884B6c7446e11aBA`. You'll see 2 paid out,
   0 disputes, 3 trades — every one clickable through to its on-chain detail.
3. **Same check, at the moment it matters:** tap *Start Escrow* and paste that
   same address as the seller. The record appears before you commit any money.
4. **Passkey sign-in:** tap the fingerprint icon next to *Sign in* on a phone
   or laptop with Face ID / Touch ID / Windows Hello. A wallet is created from
   the passkey — no seed phrase.
5. **Pay in dollars:** on *Start Escrow*, switch the toggle to **AUSD**. You'll
   be asked to approve AUSD first, then lock it. (Needs testnet AUSD in the
   wallet.)
6. **Auto-release:** open trade #2 — it shows the countdown until the seller
   can be paid without the buyer. The Chainlink workflow releases it once that
   passes.

## Honest limitations

- Testnet only. The contract hasn't been audited.
- The CRE workflow runs through Chainlink's simulator (`cre workflow
  simulate --broadcast`), which makes real testnet writes through Chainlink's
  mock forwarder. A production CRE deployment needs Chainlink's deploy access;
  switching is one `setForwarderAddress` call, no redeploy.
- Dispute arbitration is a single admin address today — a known
  centralisation point.
- Naira payouts on the exchange side are still settled manually.
