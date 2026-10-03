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

Trade **#2** on the escrow was seeded deliberately left open; its auto-release
window passes **2026-10-10 04:05 UTC**. Run the simulation after that to see
it actually release.

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
cre workflow simulate auto-release --target staging-settings              # dry run, no tx
cre workflow simulate auto-release --target staging-settings --broadcast  # real testnet write
```

`cre workflow build auto-release --target staging-settings` compiles to WASM
without logging in — verified passing.
