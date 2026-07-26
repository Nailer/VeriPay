# VeriPay

**Escrow that makes buying from strangers safe.** Built on Monad, for Nigeria.

**Live demo:** <https://monad-pay-lagos.vercel.app> · Monad testnet — no real money moves.

---

## The problem

Most retail in Nigeria happens on Instagram, WhatsApp and Jiji, between people who have never met and have no reason to trust each other.

The buyer won't pay first, because vendors take the money and disappear. The seller won't ship first, because buyers reverse transfers and lie about delivery. So the deal dies, or the two of them compromise — half now, half on delivery — and somebody still gets burned.

There's no eBay-style protection here. The vendor is a phone number and a page with nice photos.

## How VeriPay works

1. The buyer locks the payment in a smart contract.
2. The seller can see on-chain that the money is really there, so they ship.
3. The buyer confirms delivery and the funds release.

If the two disagree, either can open a dispute. The funds freeze, and an arbitrator settles it — all of it, none of it, or any split in between.

If the buyer goes quiet and never confirms, the seller isn't stuck waiting forever. After a set window, the funds can be released to them.

### Why a smart contract instead of just holding the money

Two reasons, and they're the whole point.

**We never take custody.** Holding other people's money in Nigeria makes you a custodian, which requires a licence. The contract holds it instead.

**The seller doesn't have to trust us either.** They can read the chain and confirm the money is locked before shipping. In a market where people have watched fintechs fold with customer balances, "check it yourself" is worth more than a promise.

The contract enforces this: there is no function anywhere that lets the owner move escrowed funds, and the platform fee is capped at 5% by a constant that cannot be changed.

## The naira on-ramp

Escrow only works if you can fund it, and almost nobody in Nigeria holds crypto. So a buyer can pay with a **bank transfer or a debit card** and the conversion happens behind the scenes.

Two details that matter:

- Prices are computed **server-side** from live markets. The browser only sends intent — which coin, how much naira — so a tampered request can't mint a favourable rate.
- The naira rate comes from the **live Bybit P2P order book**, not the official CBN rate that most price APIs return. Those two numbers differ by a few percent, and quoting the wrong one loses money on every trade.

Selling back is verified without trusting anyone: the transaction is read straight off a Monad node and checked for destination, sender, amount and confirmation before a payout is approved.

## Project status

Honest picture, because it matters:

- **Monad testnet only.** No real money has moved through this.
- **Not audited.** Don't put meaningful funds through it yet.
- **Not licensed.** Naira payouts are settled manually.
- No users and no revenue yet.

What does exist and works end to end: the escrow contract with fees, disputes and arbitration; the naira buy/sell flow with live pricing; card payments through Paystack; an admin console for settling orders and disputes; per-trade chat with admin oversight; and in-app notifications.

## Tech stack

| Layer | Choice |
| :--- | :--- |
| Framework | Next.js 16 (App Router, Turbopack), React 19, TypeScript |
| Styling | Tailwind CSS v4 |
| Wallets | thirdweb v5 |
| Chain access | viem, against Monad testnet (chain id 10143) |
| Contract | Solidity 0.8.24, deployed via Remix |
| Data | Supabase (Postgres, RLS on, service-role writes from the server only) |
| Cards | Paystack, verified server-side |
| Pricing | Binance spot + CoinGecko, with Bybit P2P for the naira rate |

## Getting started

**Prerequisites**

- Node.js **20.9 or newer** (Next.js 16 refuses to start on older versions)
- A browser wallet such as MetaMask, switched to **Monad Testnet** (chain id 10143 — the app offers to add it)
- Test MON from the [Monad testnet faucet](https://testnet.monad.xyz) to create escrows

```bash
npm install
```

Create `.env` in the project root:

```env
# Required
NEXT_PUBLIC_CONTRACT_ADDRESS=0xYourDeployedEscrow
NEXT_PUBLIC_THIRDWEB_CLIENT_ID=your_thirdweb_client_id
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
ADMIN_PASSCODE=choose_something_strong

# Optional
EXCHANGE_SPREAD_PERCENT=3.5
EXCHANGE_MERCHANT_BANK_NAME=Your Bank
EXCHANGE_MERCHANT_ACCOUNT_NUMBER=0123456789
EXCHANGE_MERCHANT_ACCOUNT_NAME=Your Account Name
EXCHANGE_PAYOUT_PRIVATE_KEY=0x...        # funded testnet wallet, enables automatic delivery
PAYSTACK_SECRET_KEY=sk_test_...
NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY=pk_test_...
```

> Only variables prefixed `NEXT_PUBLIC_` reach the browser. Setting `CONTRACT_ADDRESS` without the prefix silently does nothing.

Where the keys come from: the thirdweb client id is free at [thirdweb.com/create-api-key](https://thirdweb.com/create-api-key); the Supabase service-role key is under **Project Settings → API** in your Supabase project; Paystack test keys are under **Settings → API Keys & Webhooks** at [paystack.com](https://paystack.com). Without Paystack keys the card flow runs in clearly-labelled test mode.

Then:

```bash
npm run dev
```

Open <http://localhost:3000>.

> **Don't run `npm run build` while the dev server is running.** It corrupts `.next`, and the symptom is misleading — every nested API route starts returning 404 while single-level ones keep working. If that happens: `rm -rf .next` and restart.
>
> For anything you're demoing, use `npm run build && npm run start`. Dev mode recompiles per route and resets server caches, so it feels far slower than the real thing.

## Deploying the contract

There's no Hardhat or Foundry in this repo — the contract is deployed through Remix. Full walkthrough in [`contracts/README.md`](./contracts/README.md).

Two versions exist. The original (`0xd0cc532f…`) has no fee and no disputes; `contracts/VeriPayEscrow.sol` is current. The app detects which one is deployed and reads either, so old trades stay visible.

## Structure

```text
contracts/
  VeriPayEscrow.sol      the escrow contract
  README.md              Remix deployment guide
docs/                    Mintlify documentation source
src/
  app/
    page.tsx             escrow landing
    create/              open an escrow
    dashboard/           recent escrows, read from chain
    trade/[id]/          escrow detail: release, refund, dispute
    trade/[id]/chat/     per-trade chat
    exchange/            naira on-ramp: landing, buy, sell, order status
    admin/               passcode-gated console
    api/                 pricing, orders, cards, chat, admin
  lib/
    escrow.ts            reads either contract version
    pricing.ts           server-authoritative pricing
    chainVerify.ts       on-chain deposit verification
    exchangeStore.ts     order persistence and lifecycle
    paystack.ts          card payments
  components/
    ArbitrationPanel.tsx dispute resolution for the arbitrator
```

Architecture notes, conventions and the gotchas worth knowing are in [`CLAUDE.md`](./CLAUDE.md), and the exchange internals are documented in [`EXCHANGE.md`](./EXCHANGE.md).

## Licence

Copyright © 2026 Aje Emmanuel. All rights reserved.

No licence has been granted yet — this repository is source-available for review, not for reuse. If that changes, a `LICENSE` file will say so.
