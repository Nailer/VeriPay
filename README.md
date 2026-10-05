# VeriPay

**Buyer protection for Instagram and WhatsApp shopping.** A seller puts one
link in their bio. The buyer taps it, sees the seller's real track record,
and pays in naira with a fingerprint. The money is held until the order
arrives. The buyer never sees a wallet, a token or a gas fee.

| | |
|---|---|
| **Hackathon** | Monad Metropolis — Track 02, Consumer Products & Payments |
| **Live demo** | <https://monad-pay-lagos-git-hackathon-metropolis-nailer1s-projects.vercel.app> |
| **Demo video** | _link added at submission_ |
| **Network** | Monad testnet (chain id 10143). No real money moves. |
| **Submission write-up** | [`HACKATHON.md`](./HACKATHON.md) |

---

## The problem and who it's for

Most online retail in Nigeria happens between strangers on Instagram,
WhatsApp and Jiji, with no buyer protection at all. The buyer won't pay first
because sellers vanish with the money. The seller won't ship first because
buyers reverse transfers. And the first question every buyer asks — *"how do I
know you're legit?"* — is answered today with screenshots of testimonials,
which are trivially faked.

**Intended user:** an ordinary person buying from, or selling through, a
social-media shop. Not a crypto user. They should never need to know what a
blockchain is.

## How it works

1. **Seller** opens `/sell`, signs in with Face ID / fingerprint, and claims a
   link like `/pay/adasclosets`.
2. **Buyer** opens that link. Before paying they see the seller's record —
   trades paid out, disputes, refunds — computed from the chain.
3. Buyer types an amount in **naira**, signs in with a fingerprint, and pays
   by card.
4. The payment is locked in the escrow contract. Neither the seller nor
   VeriPay can take it.
5. Order arrives → buyer taps **Release** → seller is paid (minus a 1% fee,
   charged only on success).
6. Something wrong → either side raises a dispute and an arbitrator splits the
   funds. Buyer goes silent → the seller is paid automatically after 7 days.

## Why Monad

- **Speed is the product.** Locking a payment confirms in about **1 second**
  (1.0–1.2s measured on the live testnet contract). That is the difference
  between "paying" and "waiting for crypto".
- **Fees decide who you can serve.** The network cost of locking a payment is
  about **₦1** (≈0.02 MON), so VeriPay pays it for the buyer. If it cost ₦300,
  protecting a ₦2,000 order would be pointless.
- **Reputation that can't be edited.** Every trade writes real events
  (created, released, disputed, refunded). A seller's record is those events
  replayed — not a score in our database. That is only affordable when writing
  an event on *every* trade, however small, costs almost nothing.

The pay screen shows the measured time and cost after each payment — the only
place the chain is visible to the user at all.

## Contracts on Monad testnet

| Contract | Address |
|---|---|
| VeriPayEscrow | [`0x00bdf9fbc9f59cc6814bbc7a91b19bbad1517e6d`](https://testnet.monadscan.com/address/0x00bdf9fbc9f59cc6814bbc7a91b19bbad1517e6d) |
| AutoReleaseReceiver (Chainlink CRE consumer) | [`0x4bdff272df53a78887fd84a9ee9f4aa9a161a0b9`](https://testnet.monadscan.com/address/0x4bdff272df53a78887fd84a9ee9f4aa9a161a0b9) |
| vNGN — test naira token (ours) | [`0xdbb53d0a2d1b91ef6a41cf1128fef562ffc531eb`](https://testnet.monadscan.com/address/0xdbb53d0a2d1b91ef6a41cf1128fef562ffc531eb) |
| AUSD (Agora, testnet) | `0x333a12e2B519DA16EBE75012d54574C16ef4463f` |

Every transaction the app has made is listed on the escrow contract's
explorer page above.

**Every trade on the contract so far is one of our own demo or test trades**,
created so the reputation features have data to show. They are real on-chain
transactions, but they are not customers.

**vNGN is a test token we deployed ourselves** to stand in for a regulated
naira stablecoin. It is not money, is not issued or endorsed by anyone else,
and is never sold or offered. The escrow accepts any ERC-20, so a licensed
stablecoin replaces it without a contract change.

## What existed before the hackathon, and what was built during it

VeriPay was started on 11 April 2026, before Metropolis began. The rules
require pre-existing work to be identified, so here it is plainly. The git
history shows the same split: everything dated before 1 September 2026 is
foundation; everything after is the submission.

**Pre-existing foundation (before 1 Sep 2026) — not what we're asking to be judged on**

- A basic escrow app on Monad testnet: create a trade in MON, release, refund
  (`/create`, `/dashboard`, `/trade/[id]`), with a wallet-connect button.
- An earlier version of the escrow contract source with fees, disputes and
  auto-release (native MON only; it had never been deployed).
- A naira ↔ crypto exchange with an admin console (`/exchange`, `/admin`,
  documented in [`EXCHANGE.md`](./EXCHANGE.md)).
- Per-trade chat, in-app notifications, PWA install and web push.

**Built during Metropolis (1 Sep – 13 Oct 2026) — the submission**

| What | Where |
|---|---|
| **Seller payment links** — claim `/pay/<handle>` by signing a message | `src/app/sell`, `src/lib/sellers.ts`, `src/app/api/sellers` |
| **Pay in naira by card, straight into escrow** — server-verified charge, exact amount issued and locked, gas paid for the buyer | `src/app/pay/[handle]`, `src/lib/payments.ts`, `src/app/api/pay` |
| **On-chain seller reputation** — on the pay page, the create page, every trade page and a public lookup | `src/lib/reputation.ts`, `src/app/seller`, `src/components/SellerReputationCard.tsx` |
| **Reputation indexer** (Envio HyperIndex) with a direct-from-chain fallback that uses identical counting rules | `indexer/` |
| **Passkey sign-in** — Face ID / fingerprint, no seed phrase (Mera) | `src/lib/mera.ts`, `src/lib/useSignIn.ts` |
| **ERC-20 escrow** — `createTradeWithToken`, per-asset fee accounting; contract extended, deployed and verified on-chain | `contracts/VeriPayEscrow.sol` |
| **Automatic release of overdue trades** — Chainlink CRE workflow + receiver contract | `cre/`, `contracts/cre/AutoReleaseReceiver.sol` |
| **Test naira token** | `contracts/test/VeriPayTestNaira.sol` |
| **Contract test suite** — 30 tests on a local EVM | `contracts/test/` |
| **End-to-end payment test** incl. replay and cross-payment fraud attempts | `tests/e2e-pay.mjs` |
| Alchemy RPC across client and server; amounts shown in the right currency everywhere; new landing page | `src/lib/monad.ts`, `src/lib/escrow.ts`, `src/app/page.tsx` |

## Architecture

```
 Buyer's phone                    VeriPay server (Next.js)            Monad testnet
 ─────────────                    ────────────────────────            ─────────────
 /pay/<handle>  ── seller + reputation ──▶ /api/sellers
                                           /api/reputation ─────────▶ reads escrow events
 passkey sign-in (Mera) → account derived on the device
 pay by card ──▶ Paystack ──▶ /api/pay/confirm
                               · asks Paystack if the charge is real
                               · claims the payment once (SQL guard)
                               · issues exact ₦ amount ──────────────▶ vNGN.mint(buyer)
                               · tops up gas ────────────────────────▶ small MON transfer
 approve + createTradeWithToken ─────────────────────────────────────▶ VeriPayEscrow
 release / dispute / refund ─────────────────────────────────────────▶ VeriPayEscrow

 Chainlink CRE (cron) ── finds overdue trades ──▶ AutoReleaseReceiver ▶ escrow.autoRelease()
 Envio HyperIndex ◀── every escrow event ── builds per-address reputation
```

Design choices worth knowing:

- **The server never holds a buyer's escrowed money.** It issues test naira
  after a verified charge; the buyer's own passkey account locks it.
- **The contract owner cannot touch escrowed funds.** `withdrawFees` moves
  only accrued fees; the fee ceiling (5%) is a constant; a trade's fee rate is
  locked when it is created; refunds are never charged.
- **Nothing is trusted from the browser.** Card charges are verified with
  Paystack server-side, each payment reference is bound to one payment, and a
  status guard in the SQL `WHERE` clause makes double-delivery impossible.

## Technology stack

| Layer | Used |
|---|---|
| Chain | Monad testnet (10143) |
| Contracts | Solidity 0.8.24 |
| App | Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS 4 |
| Wallets / transactions | thirdweb v5, viem |
| Passkeys | `@category-labs/mera` |
| Indexing | Envio HyperIndex |
| Automation | Chainlink CRE (`@chainlink/cre-sdk`) |
| RPC | Alchemy |
| Card payments | Paystack (test mode) |
| Database | Supabase (Postgres) |
| Hosting | Vercel |

## Run it yourself

Requirements: Node.js 20 or newer, a free [Supabase](https://supabase.com)
project, a free [thirdweb client id](https://thirdweb.com/create-api-key).

```bash
git clone https://github.com/Nailer/VeriPay.git
cd VeriPay
npm install
cp .env.example .env
```

1. In your Supabase project, open the SQL editor, paste
   [`supabase/schema.sql`](./supabase/schema.sql) and run it.
2. Fill in `.env`. The required values are at the top of the file; each line
   says where to get it. The contract addresses are already filled in and
   point at the live testnet deployment.
3. Start it:

```bash
npm run dev
```

Open <http://localhost:3000>. Reading seller records and browsing trades
works with only the required values. The pay-by-card flow also needs Paystack
test keys and a vNGN minter key, as described in `.env.example`.

For anything performance-related use the production build
(`npm run build && npm run start`). Don't run `build` while `dev` is running —
it corrupts `.next`; delete that folder and restart if you do.

### Tests

```bash
# Contracts — 30 tests, compiled with solc, run on an in-process local chain
cd contracts/test && npm install && npm test

# Pay-link money path — against a running local server and Monad testnet
npm run build && npm run start      # terminal 1
node tests/e2e-pay.mjs              # terminal 2
```

### Deploying the contracts

`contracts/VeriPayEscrow.sol` has no constructor arguments and no imports, so
it deploys from [Remix](https://remix.ethereum.org) as-is. See
[`contracts/README.md`](./contracts/README.md). The CRE workflow and receiver
are covered in [`cre/README.md`](./cre/README.md), the indexer in
[`indexer/README.md`](./indexer/README.md).

## Project structure

```
src/app/pay/[handle]/     buyer checkout for a seller's link
src/app/sell/             seller claims and shares their link
src/app/seller/           public seller-record lookup
src/app/create|trade|dashboard/   direct escrow (MON or AUSD)
src/app/exchange|admin/   naira exchange + admin console (pre-hackathon)
src/app/api/              pay, sellers, reputation, notifications, exchange…
src/lib/                  payments, sellers, reputation, escrow reads, mera, monad
contracts/                VeriPayEscrow.sol, cre/ receiver, test/ suite + test token
cre/                      Chainlink CRE auto-release workflow
indexer/                  Envio HyperIndex reputation indexer
supabase/schema.sql       database setup
tests/                    end-to-end payment test
```

## Honest status

- **Testnet only.** No real money has moved. No real customers yet.
- **Not audited.** The contracts have a test suite, not a security review.
- **Pay links run on test money end to end** — Paystack test mode and our own
  test token. Sellers cannot withdraw to a bank; that needs a licensed
  stablecoin / off-ramp partner and a registered business.
- **The arbitrator is a single address** — a known centralisation point.
- **Chainlink CRE** runs through Chainlink's simulator with real testnet
  writes via their mock forwarder; production deployment needs Chainlink's
  deploy access (one `setForwarderAddress` call, no redeploy).
- **Envio**: the indexer is built and configured for the live contract; where
  it isn't reachable the app reads the same numbers directly from the chain.

## AI tools disclosure

This project was built with substantial help from AI coding tools, as the
hackathon rules permit and require to be disclosed. **Claude Code
(Anthropic)** was used throughout the hackathon period to write and refactor
code, write tests, and draft documentation, working under the founder's
direction; commits made this way carry a `Co-Authored-By: Claude` line in the
git history. Product decisions, design direction, deployment and testing on
real devices were done by the founder.

## Credits and third-party code

- **Chainlink** — `contracts/cre/ReceiverTemplate.sol`, `IReceiver.sol` and
  `IERC165.sol` are copied unmodified from Chainlink's
  [`cre-templates`](https://github.com/smartcontractkit/cre-templates)
  (`starter-templates/keeper-bot`), MIT licensed. Each file says so in its
  header. `AutoReleaseReceiver.sol` is our own code built on top of them.
- **OpenZeppelin Contracts** (MIT) — `Ownable`, imported by the Chainlink
  template.
- **Libraries** (see `package.json` for versions): Next.js, React, Tailwind
  CSS, thirdweb, viem, `@category-labs/mera`, `@scure/bip32` / `bip39`,
  Supabase JS, `web-push`, `next-themes`, lucide-react icons,
  `@chainlink/cre-sdk`, Envio. Test tooling: solc, Ganache.
- **Services**: Alchemy (RPC), Paystack (card payments), Supabase (database),
  Vercel (hosting), Bybit P2P / Binance / CoinGecko public price data (exchange
  pricing).

Everything else in this repository is original work by the author.

## Licence

[MIT](./LICENSE) © 2026 Aje Emmanuel
