# VeriPay reputation indexer

Turns VeriPayEscrow's on-chain trade events into a public, per-address
reputation figure — completed trades, disputes, refunds — derived entirely
from event replay. Nothing here is a number we could quietly edit; anyone
can independently re-derive the same result straight from the chain. See
the comment at the top of `src/EventHandlers.ts` for why.

## Setup

1. Deploy the escrow contract (see `../contracts/README.md`) and note its address.
2. `export CONTRACT_ADDRESS=0xYourDeployedEscrow`
3. `npm install`
4. `npm run codegen` — regenerates `.envio/types.d.ts` from `config.yaml` + `schema.graphql`. Run this again any time either file changes.

## Running locally

`npm run dev` starts a local indexer + GraphQL playground. It needs Docker
(spins up Postgres + Hasura) — install Docker Desktop first if you don't
have it.

## Deploying (hosted)

Envio's hosted service is the path used for the actual demo/production
setup, so the app doesn't depend on a laptop staying online:

1. Create an account and API token at <https://envio.dev/app/api-tokens>.
2. `envio deploy` (see Envio's docs for the exact flow — this changes
   occasionally, check <https://docs.envio.dev> rather than trust this file
   blindly if it's been a while).
3. Set `ENVIO_GRAPHQL_URL` in the main app's `.env` (and on Vercel) to the
   resulting GraphQL endpoint. `src/app/api/reputation/[address]/route.ts`
   in the main app reads it from there — without it, that route responds
   with `configured: false` rather than erroring.

## Schema

- `TradeRecord` — one row per trade, mirrors on-chain state (buyer, seller,
  amount, token, status, createdAt).
- `AddressReputation` — one row per address that has ever been a buyer or
  seller, rolled up from `TradeRecord`. `totalTrades`, `completedTrades`,
  `disputedTrades`, `refundedTrades`, `lastActivityAt`.
