// CRE cron workflow: finds VeriPayEscrow trades whose buyer-confirmation
// window has passed and pokes AutoReleaseReceiver to release them, instead
// of relying on a human to remember to call autoRelease() by hand. See
// contracts/cre/AutoReleaseReceiver.sol for the on-chain half of this.
//
// Written against @chainlink/cre-sdk's real, installed types (verified by
// reading node_modules, not guessed from docs) rather than the higher-level
// generated contract-binding style shown in Chainlink's own keeper-bot
// template (`KeeperConsumer` class with typed `.needsUpkeep()` methods) —
// that binding is produced by the CRE CLI's codegen step against a deployed
// contract, which needs Chainlink's gated CLI/account access this was built
// without. This file talks to evmClient.callContract / writeReport directly
// instead. If the CLI becomes available, regenerating a typed binding for
// AutoReleaseReceiver and VeriPayEscrow would be a nice simplification, not
// a required one — the logic here is complete on its own.

import { bytesToHex, cre, getNetwork, hexToBase64, TxStatus, type Runtime } from '@chainlink/cre-sdk'
import {
  type Address,
  decodeFunctionResult,
  encodeAbiParameters,
  encodeFunctionData,
  hexToBytes,
} from 'viem'
import { z } from 'zod'

// ─── Config schema ──────────────────────────────────────────────────────────
export const configSchema = z.object({
  schedule: z.string(), // standard cron expression, e.g. "0 */15 * * * *" — every 15 minutes
  chainSelectorName: z.string(), // "monad-testnet"
  escrowAddress: z.string(), // deployed VeriPayEscrow (contracts/VeriPayEscrow.sol)
  receiverAddress: z.string(), // deployed AutoReleaseReceiver (contracts/cre/AutoReleaseReceiver.sol)
  gasLimit: z.string().default('500000'),
  // How many of the most recent trade ids to check each run. Mirrors the
  // same bounded-scan approach ArbitrationPanel.tsx already uses for
  // disputes (SCAN_LIMIT) — scanning the full history on every tick doesn't
  // scale, and a trade past its auto-release window stays eligible on every
  // subsequent run until it's actually settled, so a bounded recent window
  // won't quietly skip anything for long.
  scanLimit: z.number().default(150),
})
type Config = z.infer<typeof configSchema>

// Just the two read functions and the shape of Trade this workflow needs —
// not the full ABI. Field order matches contracts/VeriPayEscrow.sol's Trade
// struct exactly (see the comment there on why it's laid out this way).
const nextTradeIdAbi = [
  { type: 'function', name: 'nextTradeId', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
] as const

const getTradeAbi = [
  {
    type: 'function', name: 'getTrade', stateMutability: 'view',
    inputs: [{ type: 'uint256' }],
    outputs: [{
      type: 'tuple', components: [
        { name: 'buyer', type: 'address' },
        { name: 'seller', type: 'address' },
        { name: 'amount', type: 'uint256' },
        { name: 'released', type: 'bool' },
        { name: 'sellerApprovedRefund', type: 'bool' },
        { name: 'metadata', type: 'string' },
        { name: 'createdAt', type: 'uint64' },
        { name: 'autoReleaseAt', type: 'uint64' },
        { name: 'disputed', type: 'bool' },
        { name: 'refunded', type: 'bool' },
        { name: 'feeBps', type: 'uint16' },
        { name: 'token', type: 'address' },
      ],
    }],
  },
] as const

function toBytes(address: string): Uint8Array {
  return hexToBytes(address as `0x${string}`)
}

export const onCronTrigger = (runtime: Runtime<Config>): string => {
  const { chainSelectorName, escrowAddress, receiverAddress, gasLimit, scanLimit } = runtime.config

  const network = getNetwork({ chainFamily: 'evm', chainSelectorName, isTestnet: true })
  if (!network) throw new Error(`Network not found: ${chainSelectorName}`)

  const evmClient = new cre.capabilities.EVMClient(network.chainSelector.selector)

  // "Now," sourced from the chain itself rather than any off-chain clock —
  // autoReleaseAt is a block timestamp, so it should be compared against one.
  // blockNumber omitted deliberately: the SDK treats that as "latest".
  const header = evmClient.headerByNumber(runtime, {}).result()
  const now = header.header?.timestamp ?? 0n
  if (now === 0n) throw new Error('Could not read the latest block header')

  const nextIdData = evmClient
    .callContract(runtime, {
      call: { from: new Uint8Array(20), to: toBytes(escrowAddress), data: hexToBytes(encodeFunctionData({ abi: nextTradeIdAbi, functionName: 'nextTradeId' })) },
    })
    .result()
  const nextTradeId = decodeFunctionResult({ abi: nextTradeIdAbi, functionName: 'nextTradeId', data: bytesToHex(nextIdData.data) }) as bigint

  const startId = nextTradeId > BigInt(scanLimit) ? nextTradeId - BigInt(scanLimit) : 0n
  const dueTradeIds: bigint[] = []

  for (let id = startId; id < nextTradeId; id++) {
    const raw = evmClient
      .callContract(runtime, {
        call: { from: new Uint8Array(20), to: toBytes(escrowAddress), data: hexToBytes(encodeFunctionData({ abi: getTradeAbi, functionName: 'getTrade', args: [id] })) },
      })
      .result()
    const trade = decodeFunctionResult({ abi: getTradeAbi, functionName: 'getTrade', data: bytesToHex(raw.data) }) as {
      released: boolean; refunded: boolean; disputed: boolean; autoReleaseAt: bigint;
    }

    const isDue = !trade.released && !trade.refunded && !trade.disputed && trade.autoReleaseAt > 0n && now >= trade.autoReleaseAt
    if (isDue) dueTradeIds.push(id)
  }

  runtime.log(`Scanned trades ${startId}-${nextTradeId - 1n}, found ${dueTradeIds.length} due for auto-release`)

  if (dueTradeIds.length === 0) {
    return 'No trades due for auto-release'
  }

  const reportPayload = encodeAbiParameters([{ type: 'uint256[]' }], [dueTradeIds])

  const report = runtime
    .report({
      encodedPayload: hexToBase64(reportPayload),
      encoderName: 'evm',
      signingAlgo: 'ecdsa',
      hashingAlgo: 'keccak256',
    })
    .result()

  const writeResult = evmClient
    .writeReport(runtime, {
      receiver: toBytes(receiverAddress),
      report,
      gasConfig: { gasLimit: BigInt(gasLimit) },
    })
    .result()

  if (writeResult.txStatus !== TxStatus.SUCCESS) {
    throw new Error(`AutoReleaseReceiver write failed: ${writeResult.errorMessage || writeResult.txStatus}`)
  }

  // A per-trade failure inside the batch (e.g. one was already settled by
  // the time this report landed) does NOT fail this transaction — see
  // AutoReleaseReceiver's try/catch and its AutoReleaseFailed event. It's
  // only re-attempted next run if it's still genuinely due.
  return `Submitted auto-release for ${dueTradeIds.length} trade(s): ${dueTradeIds.join(', ')}`
}

export function initWorkflow(config: Config) {
  const cronTrigger = new cre.capabilities.CronCapability()

  return [
    cre.handler(cronTrigger.trigger({ schedule: config.schedule }), onCronTrigger),
  ]
}
