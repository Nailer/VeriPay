# Deploying VeriPayEscrow with Remix

You deployed the first contract through Remix, so these steps stay in Remix. No
Hardhat or Foundry needed.

## What changed and why

The original contract could only settle if both parties agreed. If they
disagreed, the money was stuck permanently — nobody could move it, including
us. It also charged nothing, so the core product had no revenue.

This version adds:

| | Original | New |
|---|---|---|
| Deadlock between buyer and seller | funds stuck forever | either party raises a dispute, arbitrator splits the funds any way |
| Buyer stops responding | seller waits forever | after 7 days anyone can trigger release to the seller |
| Platform revenue | none | 1% by default, taken **only** from successful releases |
| Refunds | full | full, and **never** charged a fee |
| Fee changes | n/a | capped at 5% in code; the rate is locked per trade at creation |
| Owner access to escrowed money | n/a | none — `withdrawFees` can only move already-earned fees |

## Deploy

1. Open <https://remix.ethereum.org>.
2. In **File explorer**, create `VeriPayEscrow.sol` and paste in the contents of
   `contracts/VeriPayEscrow.sol` from this repo.
3. **Solidity compiler** tab:
   - Compiler `0.8.24` or newer
   - Turn **optimization on**, runs `200`
   - EVM version: leave on default (Monad accepts Shanghai and Cancun output —
     your first contract already uses PUSH0 and runs fine)
   - Click **Compile**
4. **Deploy & run transactions** tab:
   - Environment: **Injected Provider — MetaMask**
   - Make sure MetaMask is on **Monad Testnet** (chain id 10143)
   - Contract: `VeriPayEscrow`
   - The constructor takes **no arguments** — just click **Deploy**
5. Approve in MetaMask, then copy the deployed address.

On deployment you become owner, arbitrator and fee recipient, with a 1% fee and
a 7-day release window. All four are changeable afterwards.

## Point the app at it

Add to `.env`:

```
NEXT_PUBLIC_CONTRACT_ADDRESS=0xYourNewAddress
```

Then restart:

```bash
rm -rf .next && npm run dev
```

**The app will not read the old contract with the new ABI.** The old one returns
6 fields from `trades()`, the new one returns 11, so decoding fails. Deploy
first, set the address, then restart. Trades created on the old contract stay
there — nothing is lost, but the app won't list them.

## Tuning after deployment

All from the Remix **Deployed Contracts** panel, as the owner:

| Function | Purpose | Example |
|---|---|---|
| `setFeeBps` | change the fee (max 500 = 5%) | `100` = 1% |
| `setAutoReleaseDelay` | buyer's confirmation window, in seconds (1–90 days) | `604800` = 7 days |
| `setArbitrator` | who can settle disputes | a dedicated wallet, not your deploy key |
| `setFeeRecipient` | where withdrawn fees go | your treasury wallet |
| `withdrawFees` | collect earned fees | — |

Two reads worth knowing: `accruedFees` is what you can withdraw, and
`escrowedBalance` is customer money you can never touch.

## Verified behaviour

Compiled clean (no warnings, 8.1 KB, well under the 24 KB limit) and exercised
on a local EVM — 27 checks covering: the 1% fee on release, fee-free refunds, a
50/50 arbitrated split, a 100%-to-buyer ruling, auto-release after timeout,
and rejection of every unauthorised path (outsiders resolving disputes, sellers
releasing to themselves, fees above the ceiling, plain transfers into the
contract, double settlement, withdrawing with nothing accrued).

## Known limitations

- Payouts are **push** — if a buyer or seller is a contract that rejects
  incoming funds, settlement reverts. Fine for normal wallets; worth moving to
  a claim-based pattern before mainnet.
- The arbitrator is a single address. Decentralising that (multisig, or staked
  jurors) is a later problem, not a launch problem.
- Not audited. Do not put meaningful money through this until it is.
