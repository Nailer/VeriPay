# VeriPay auto-release — Chainlink CRE workflow

Today, `VeriPayEscrow.autoRelease()` only fires if a human remembers to call it
after a buyer's 7-day confirmation window passes — a seller whose buyer goes
quiet just waits. This workflow runs on a cron (every 15 min), finds trades
that are past their window and not disputed, and releases them through a
signed CRE report.

## Live on Monad testnet

| Piece | Address |
|---|---|
| `VeriPayEscrow` | `0x00bdf9fbc9f59cc6814bbc7a91b19bbad1517e6d` |
| `AutoReleaseReceiver` (consumer contract) | `0x4bdff272df53a78887fd84a9ee9f4aa9a161a0b9` |
| Forwarder it trusts | `0xB9F79d863261869B234c481D1f9A7af84AeAd192` — Chainlink's **MockKeystoneForwarder** for Monad testnet, the one `cre workflow simulate --broadcast` uses |

For a real (non-simulated) deployment, the receiver's owner calls
`setForwarderAddress(0xF8344CFd5c43616a4366C34E3EEE75af79a74482)` — the
production KeystoneForwarder for Monad testnet — after getting CRE deploy
access. No redeploy needed.

**It has run for real.** Trade #2 was deliberately left open by its buyer. On
2026-10-11 this workflow found it past its auto-release window and released
it: forwarder → `AutoReleaseReceiver` → `VeriPayEscrow.autoRelease(2)`, events
`AutoReleaseSucceeded(2)`, `AutoReleased(2, seller)` and `FeeCharged(2)` —
[`0xa5cf52aeac617514c10055bf703c2766eb5366f640958c171006681b9d87f823`](https://testnet.monadscan.com/tx/0xa5cf52aeac617514c10055bf703c2766eb5366f640958c171006681b9d87f823).

## Layout

```
cre/
  project.yaml            RPC per target (public Monad node)
  secrets.yaml            none needed
  .env                    CRE_ETH_PRIVATE_KEY — gitignored; pays gas for --broadcast
  auto-release/
    workflow.yaml         targets → entry point + config file
    config.staging.json   schedule, chain, escrow + receiver addresses
    main.ts               Runner entry point
    workflow.ts           the logic
```

On-chain half: `../contracts/cre/` — `AutoReleaseReceiver.sol` plus
Chainlink's own `ReceiverTemplate.sol` / `IReceiver.sol` / `IERC165.sol`,
vendored verbatim from `smartcontractkit/cre-templates`. Locally EVM-tested,
10/10.

## Running it

Needs the CRE CLI (`~/.cre/bin/cre`), Bun, and a free CRE account.

```bash
cre login                                   # once — opens a browser
cd cre
./simulate.sh              # dry run — reads the chain, sends nothing
./simulate.sh --broadcast  # real testnet write (needs CRE_ETH_PRIVATE_KEY in cre/.env)
```

Use `simulate.sh` rather than calling `cre workflow simulate` in place: run
from inside this repository the compiled workflow traps at start-up, while the
identical source runs correctly from a clean copy outside it. The script makes
that copy. The cause isn't identified yet; see the comment in the script for
what was ruled out. Install dependencies with **Bun** (`bun install`), which is
what the CRE compiler expects.
