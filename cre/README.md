# VeriPay auto-release CRE workflow

Automates `VeriPayEscrow.autoRelease()` — today, a seller whose buyer has gone
quiet just waits forever unless someone happens to call that function by
hand. This is a Chainlink CRE cron workflow that checks recent trades every
15 minutes and triggers release for anything past its window, disputed
trades excluded.

## Pieces

- `contracts/cre/ReceiverTemplate.sol`, `IReceiver.sol`, `IERC165.sol` — vendored verbatim from Chainlink's `cre-templates` repo (`starter-templates/keeper-bot`), not reimplemented. This is the security-critical signature/sender-verification layer; don't hand-roll it.
- `contracts/cre/AutoReleaseReceiver.sol` — the VeriPay-specific piece. Receives a signed CRE report containing a batch of trade ids and calls `autoRelease(id)` on each, via try/catch so one already-settled trade in a batch doesn't block the rest. Locally tested (10/10 passing): authorized-forwarder success path, unauthorized-sender rejection, batch partial-failure resilience, forwarder rotation.
- `cre/workflow.ts` — the workflow itself: reads `nextTradeId()` and scans the most recent `scanLimit` trades (same bounded-scan approach `ArbitrationPanel.tsx` already uses for disputes) for ones whose `autoReleaseAt` has passed, packs the due ids into a signed report, and writes it to the receiver.
- `cre/main.ts` — entrypoint boilerplate (`Runner.newRunner` + `runner.run`), same shape as Chainlink's own templates.

Written against `@chainlink/cre-sdk`'s real installed types (verified by reading `node_modules`, not guessed from docs) — using the lower-level `evmClient.callContract` / `runtime.report` / `evmClient.writeReport` primitives directly, not the higher-level generated contract-binding style Chainlink's own `keeper-bot` template uses (a `KeeperConsumer` class with typed `.needsUpkeep()` methods). That binding is produced by the CRE CLI's codegen against a deployed contract, which needs Chainlink's CLI/account access — not available in the environment this was built in. The workflow logic here doesn't depend on it; regenerating a typed binding later would be a nice simplification, not a requirement.

## What's genuinely left to do

1. **Deploy `AutoReleaseReceiver.sol`** via Remix, same as the escrow contract (see `../contracts/README.md`), passing the CRE Forwarder address for your target chain (see Chainlink's [Forwarder Directory](https://docs.chain.link/cre/guides/workflow/using-evm-client/forwarder-directory-ts)) and the deployed `VeriPayEscrow` address as constructor args.
2. **Get CRE deploy access.** Chainlink's CRE CLI needs an account and deploy access request — see <https://docs.chain.link/cre/getting-started/overview>. Not something that can be done on the founder's behalf.
3. Fill in `cre/config.example.json` with the real escrow and receiver addresses, rename it to whatever the CRE CLI's config convention expects (check current docs — this evolves), and deploy the workflow with the CLI.
4. **Not runnable/testable locally** — CRE workflows compile to WASM and execute inside a DON's TEE; there's no local simulator set up here. `workflow.ts` passes `tsc --noEmit` against the real SDK types, which is the verification available without that access.
