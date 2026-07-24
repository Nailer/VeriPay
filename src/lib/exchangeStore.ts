// Persistent store for exchange (on/off-ramp) orders, backed by Supabase.
// Status advancement is lazy and time-based (computed on read), so it also
// behaves sensibly without background timers.

import { createWalletClient, createPublicClient, http, parseEther } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { supabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";

export type OrderSide = "buy" | "sell";

export type OrderStatus =
  | "awaiting_payment" // buy: waiting for user's NGN transfer | sell: waiting for user's crypto transfer
  | "confirming"       // buy: NGN marked sent, merchant confirming | sell: crypto tx seen, NGN payout processing
  | "completed"
  | "cancelled";

export type BankDetails = {
  bankName: string;
  accountNumber: string;
  accountName: string;
};

export type ExchangeOrder = {
  id: string;
  side: OrderSide;
  coin: string;       // symbol, e.g. "MON"
  coinName: string;
  amountCrypto: number;
  amountNgn: number;
  rate: number;       // NGN per 1 coin at time of order
  feeNgn: number;
  walletAddress: string;   // user's wallet (destination for buy, source for sell)
  bank?: BankDetails;      // user's bank account (sell side payout)
  status: OrderStatus;
  createdAt: number;
  paidAt?: number;         // buy: when user marked NGN sent | sell: when crypto tx submitted
  txHash?: string;         // sell: user's on-chain crypto transfer
  payoutTxHash?: string;   // buy: real MON payout tx (if hot wallet configured)
  settlementRef: string;   // human-friendly settlement reference
};

type OrderRow = {
  id: string;
  side: OrderSide;
  coin: string;
  coin_name: string | null;
  amount_crypto: number;
  amount_ngn: number;
  rate: number | null;
  fee_ngn: number | null;
  wallet_address: string;
  bank_name: string | null;
  bank_account_number: string | null;
  bank_account_name: string | null;
  status: OrderStatus;
  created_at: string;
  paid_at: string | null;
  tx_hash: string | null;
  payout_tx_hash: string | null;
  settlement_ref: string;
};

function rowToOrder(row: OrderRow): ExchangeOrder {
  return {
    id: row.id,
    side: row.side,
    coin: row.coin,
    coinName: row.coin_name || row.coin,
    amountCrypto: Number(row.amount_crypto),
    amountNgn: Number(row.amount_ngn),
    rate: Number(row.rate ?? 0),
    feeNgn: Number(row.fee_ngn ?? 0),
    walletAddress: row.wallet_address,
    bank: row.bank_name
      ? { bankName: row.bank_name, accountNumber: row.bank_account_number || "", accountName: row.bank_account_name || "" }
      : undefined,
    status: row.status,
    createdAt: new Date(row.created_at).getTime(),
    paidAt: row.paid_at ? new Date(row.paid_at).getTime() : undefined,
    txHash: row.tx_hash ?? undefined,
    payoutTxHash: row.payout_tx_hash ?? undefined,
    settlementRef: row.settlement_ref,
  };
}

// How long the "merchant" takes to confirm/settle after the user acts.
const SETTLE_DELAY_MS = 40_000;

// Bank account shown to buyers (the merchant's collection account).
export const MERCHANT_BANK: BankDetails = {
  bankName: process.env.EXCHANGE_MERCHANT_BANK_NAME || "Moniepoint MFB",
  accountNumber: process.env.EXCHANGE_MERCHANT_ACCOUNT_NUMBER || "8123456789",
  accountName: process.env.EXCHANGE_MERCHANT_ACCOUNT_NAME || "VERIPAY LIQUIDITY LTD",
};

const MONAD_CHAIN = {
  id: 10143,
  name: "Monad Testnet",
  nativeCurrency: { name: "MON", symbol: "MON", decimals: 18 },
  rpcUrls: {
    default: { http: ["https://testnet-rpc.monad.xyz"] },
    public: { http: ["https://testnet-rpc.monad.xyz"] },
  },
};

// Where sellers send their MON. Prefer an explicit env address, else the payout
// wallet's own address, else a testnet burn placeholder.
export function getMerchantDepositAddress(): string {
  if (process.env.EXCHANGE_MERCHANT_ADDRESS) return process.env.EXCHANGE_MERCHANT_ADDRESS;
  const pk = process.env.EXCHANGE_PAYOUT_PRIVATE_KEY;
  if (pk) {
    try {
      return privateKeyToAccount(pk as `0x${string}`).address;
    } catch { /* fall through */ }
  }
  return "0x000000000000000000000000000000000000dEaD";
}

function makeId(): string {
  const chars = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  let s = "";
  for (let i = 0; i < 6; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

export async function createOrder(
  input: Omit<ExchangeOrder, "id" | "status" | "createdAt" | "settlementRef">
): Promise<ExchangeOrder> {
  const id = makeId();
  const settlementRef = `VP-${id}-${new Date().getFullYear()}`;

  if (!isSupabaseConfigured()) {
    return {
      ...input,
      id,
      status: "awaiting_payment",
      createdAt: Date.now(),
      settlementRef,
    };
  }

  const { data, error } = await supabaseAdmin
    .from("exchange_orders")
    .insert({
      id,
      side: input.side,
      coin: input.coin,
      coin_name: input.coinName,
      amount_crypto: input.amountCrypto,
      amount_ngn: input.amountNgn,
      rate: input.rate,
      fee_ngn: input.feeNgn,
      wallet_address: input.walletAddress,
      bank_name: input.bank?.bankName,
      bank_account_number: input.bank?.accountNumber,
      bank_account_name: input.bank?.accountName,
      status: "awaiting_payment",
      settlement_ref: settlementRef,
    })
    .select()
    .single();

  if (error || !data) {
    console.error("createOrder error:", error?.message);
    throw new Error("Failed to create order");
  }

  return rowToOrder(data as OrderRow);
}

// If a funded testnet hot wallet is configured, actually send MON to the buyer.
const payoutInFlight = new Set<string>();
async function attemptRealPayout(order: ExchangeOrder): Promise<string | undefined> {
  const pk = process.env.EXCHANGE_PAYOUT_PRIVATE_KEY;
  if (!pk || order.coin !== "MON" || order.payoutTxHash || payoutInFlight.has(order.id)) return order.payoutTxHash;
  payoutInFlight.add(order.id);
  try {
    const account = privateKeyToAccount(pk as `0x${string}`);
    const walletClient = createWalletClient({
      account,
      chain: MONAD_CHAIN as any,
      transport: http("https://testnet-rpc.monad.xyz"),
    });
    const publicClient = createPublicClient({
      chain: MONAD_CHAIN as any,
      transport: http("https://testnet-rpc.monad.xyz"),
    });
    const hash = await walletClient.sendTransaction({
      to: order.walletAddress as `0x${string}`,
      value: parseEther(String(order.amountCrypto)),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      chain: MONAD_CHAIN as any,
    });
    await publicClient.waitForTransactionReceipt({ hash, confirmations: 1 });
    return hash;
  } catch (err) {
    console.error(`Exchange payout failed for order ${order.id}:`, err);
    return undefined;
  } finally {
    payoutInFlight.delete(order.id);
  }
}

// Lazily advance an order based on elapsed time since the user acted.
export async function advanceOrder(order: ExchangeOrder): Promise<ExchangeOrder> {
  if (order.status === "confirming" && order.paidAt && Date.now() - order.paidAt >= SETTLE_DELAY_MS) {
    let payoutTxHash = order.payoutTxHash;
    if (order.side === "buy") {
      payoutTxHash = await attemptRealPayout(order);
    }

    if (isSupabaseConfigured()) {
      await supabaseAdmin
        .from("exchange_orders")
        .update({ status: "completed", payout_tx_hash: payoutTxHash })
        .eq("id", order.id);
    }

    return { ...order, status: "completed", payoutTxHash };
  }
  return order;
}

export async function getOrder(id: string): Promise<ExchangeOrder | undefined> {
  if (!isSupabaseConfigured()) return undefined;

  const { data, error } = await supabaseAdmin
    .from("exchange_orders")
    .select()
    .eq("id", id.toUpperCase())
    .maybeSingle();

  if (error || !data) return undefined;
  return advanceOrder(rowToOrder(data as OrderRow));
}

export async function listOrdersByAddress(address: string): Promise<ExchangeOrder[]> {
  if (!isSupabaseConfigured()) return [];

  const { data, error } = await supabaseAdmin
    .from("exchange_orders")
    .select()
    .ilike("wallet_address", address)
    .order("created_at", { ascending: false });

  if (error || !data) return [];
  const orders = (data as OrderRow[]).map(rowToOrder);
  return Promise.all(orders.map(advanceOrder));
}

export async function listAllOrders(): Promise<ExchangeOrder[]> {
  if (!isSupabaseConfigured()) return [];

  const { data, error } = await supabaseAdmin
    .from("exchange_orders")
    .select()
    .order("created_at", { ascending: false });

  if (error || !data) return [];
  const orders = (data as OrderRow[]).map(rowToOrder);
  return Promise.all(orders.map(advanceOrder));
}

export async function updateOrderStatus(
  id: string,
  patch: Partial<{ status: OrderStatus; paidAt: number; txHash: string }>
): Promise<ExchangeOrder | undefined> {
  if (!isSupabaseConfigured()) return undefined;

  const updates: Record<string, unknown> = {};
  if (patch.status) updates.status = patch.status;
  if (patch.paidAt) updates.paid_at = new Date(patch.paidAt).toISOString();
  if (patch.txHash) updates.tx_hash = patch.txHash;

  const { data, error } = await supabaseAdmin
    .from("exchange_orders")
    .update(updates)
    .eq("id", id.toUpperCase())
    .select()
    .single();

  if (error || !data) return undefined;
  return rowToOrder(data as OrderRow);
}
