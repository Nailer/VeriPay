// Independent on-chain verification of the sell leg.
//
// When a user says "I sent you 10 MON", we do not take their word for it and we
// do not ask an admin to eyeball an explorer. We read the transaction straight
// from a Monad RPC node and check every claim ourselves:
//
//   • the transaction exists and actually succeeded
//   • it was sent to OUR deposit address
//   • it carries at least the amount the order is owed
//   • it came from the wallet that opened the order
//   • it is confirmed, not still pending
//
// Replay ("settle five orders with one deposit") is blocked separately by a
// unique index on lower(tx_hash) in the database.

import { createPublicClient, http, parseEther, formatEther } from "viem";

const MONAD_RPC = process.env.MONAD_RPC_URL || "https://testnet-rpc.monad.xyz";

const MONAD_CHAIN = {
  id: 10143,
  name: "Monad Testnet",
  nativeCurrency: { name: "MON", symbol: "MON", decimals: 18 },
  rpcUrls: { default: { http: [MONAD_RPC] }, public: { http: [MONAD_RPC] } },
};

export type VerificationResult =
  | { ok: true; valueMon: string; from: string; confirmations: number }
  | { ok: false; reason: string; retryable: boolean };

/** Accept a hair under the expected amount to absorb float/rounding dust. */
const TOLERANCE = 0.999;

export async function verifyDeposit(params: {
  txHash: string;
  expectedTo: string;
  expectedAmountCrypto: number;
  expectedFrom?: string;
}): Promise<VerificationResult> {
  const { txHash, expectedTo, expectedAmountCrypto, expectedFrom } = params;

  if (!/^0x[a-fA-F0-9]{64}$/.test(txHash)) {
    return { ok: false, reason: "That doesn't look like a valid transaction hash.", retryable: false };
  }

  const client = createPublicClient({
    chain: MONAD_CHAIN as any,
    transport: http(MONAD_RPC),
  });

  let tx;
  try {
    tx = await client.getTransaction({ hash: txHash as `0x${string}` });
  } catch {
    return {
      ok: false,
      reason: "We can't find that transaction on Monad yet. If you just sent it, wait a few seconds and try again.",
      retryable: true,
    };
  }

  if (!tx) {
    return { ok: false, reason: "Transaction not found on Monad.", retryable: true };
  }

  // Must have actually landed successfully.
  let receipt;
  try {
    receipt = await client.getTransactionReceipt({ hash: txHash as `0x${string}` });
  } catch {
    return { ok: false, reason: "Transaction is still pending confirmation.", retryable: true };
  }

  if (receipt.status !== "success") {
    return { ok: false, reason: "That transaction failed on-chain.", retryable: false };
  }

  // Right destination?
  if (!tx.to || tx.to.toLowerCase() !== expectedTo.toLowerCase()) {
    return {
      ok: false,
      reason: "That transaction wasn't sent to the VeriPay deposit address.",
      retryable: false,
    };
  }

  // Right sender? (guards against pasting someone else's transaction)
  if (expectedFrom && tx.from.toLowerCase() !== expectedFrom.toLowerCase()) {
    return {
      ok: false,
      reason: "That transaction came from a different wallet than the one that opened this order.",
      retryable: false,
    };
  }

  // Enough value?
  const expectedWei = parseEther(String(expectedAmountCrypto));
  const minimumWei = (expectedWei * BigInt(Math.round(TOLERANCE * 1000))) / BigInt(1000);
  if (tx.value < minimumWei) {
    return {
      ok: false,
      reason: `That transaction only sent ${formatEther(tx.value)} MON, but this order is for ${expectedAmountCrypto} MON.`,
      retryable: false,
    };
  }

  let confirmations = 1;
  try {
    const head = await client.getBlockNumber();
    confirmations = Number(head - receipt.blockNumber) + 1;
  } catch { /* a successful receipt already implies inclusion */ }

  return {
    ok: true,
    valueMon: formatEther(tx.value),
    from: tx.from,
    confirmations: Math.max(confirmations, 1),
  };
}
