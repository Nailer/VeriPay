// Persistent store for exchange (on/off-ramp) orders, backed by Supabase.
//
// Order lifecycle — nothing here advances on a timer. Value only moves when a
// payment has been positively confirmed by a party we trust:
//
//   BUY  (user pays NGN, we send crypto)
//     awaiting_payment ──user declares payment──▶ payment_review
//                                                     │
//                             admin confirms against  │  admin rejects
//                             the bank statement      ▼
//                                                completed / rejected
//
//     …or, when paid by card, Paystack itself is the oracle:
//     awaiting_payment ──charge verified with Paystack──▶ verified ──▶ completed
//
//   SELL (user sends crypto, we pay NGN)
//     awaiting_payment ──tx proven on-chain──▶ verified ──admin pays out──▶ completed
//
// An unpaid order expires when its locked quote lapses, so we are never bound
// to a stale rate.

import { createWalletClient, createPublicClient, http, parseEther } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { supabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";

export type OrderSide = "buy" | "sell";
export type PaymentMethod = "transfer" | "card";

export type OrderStatus =
  | "awaiting_payment"
  | "payment_review"
  | "verified"
  | "completed"
  | "rejected"
  | "expired"
  | "cancelled";

export type BankDetails = {
  bankName: string;
  accountNumber: string;
  accountName: string;
};

export type ExchangeOrder = {
  id: string;
  side: OrderSide;
  paymentMethod: PaymentMethod;
  coin: string;
  coinName: string;
  amountCrypto: number;
  amountNgn: number;
  /** Exact figure the buyer must transfer, unique per order for reconciliation. */
  exactAmountNgn: number;
  rate: number;
  baseRate: number;
  spreadPercent: number;
  feeNgn: number;
  walletAddress: string;
  bank?: BankDetails;
  status: OrderStatus;
  createdAt: number;
  quoteExpiresAt?: number;
  paidAt?: number;
  verifiedAt?: number;
  reviewedAt?: number;
  releasedAt?: number;
  /** Name on the account the buyer says they paid from. */
  payerName?: string;
  payerNote?: string;
  txHash?: string;
  payoutTxHash?: string;
  paystackRef?: string;
  payoutRef?: string;
  adminNote?: string;
  rejectionReason?: string;
  settlementRef: string;
};

type OrderRow = {
  id: string;
  side: OrderSide;
  payment_method: PaymentMethod | null;
  coin: string;
  coin_name: string | null;
  amount_crypto: number;
  amount_ngn: number;
  exact_amount_ngn: number | null;
  rate: number | null;
  base_rate: number | null;
  spread_percent: number | null;
  fee_ngn: number | null;
  wallet_address: string;
  bank_name: string | null;
  bank_account_number: string | null;
  bank_account_name: string | null;
  status: OrderStatus;
  created_at: string;
  quote_expires_at: string | null;
  paid_at: string | null;
  verified_at: string | null;
  reviewed_at: string | null;
  released_at: string | null;
  payer_name: string | null;
  payer_note: string | null;
  tx_hash: string | null;
  payout_tx_hash: string | null;
  paystack_ref: string | null;
  payout_ref: string | null;
  admin_note: string | null;
  rejection_reason: string | null;
  settlement_ref: string;
};

const ms = (v: string | null) => (v ? new Date(v).getTime() : undefined);

function rowToOrder(row: OrderRow): ExchangeOrder {
  return {
    id: row.id,
    side: row.side,
    paymentMethod: row.payment_method ?? "transfer",
    coin: row.coin,
    coinName: row.coin_name || row.coin,
    amountCrypto: Number(row.amount_crypto),
    amountNgn: Number(row.amount_ngn),
    exactAmountNgn: Number(row.exact_amount_ngn ?? row.amount_ngn),
    rate: Number(row.rate ?? 0),
    baseRate: Number(row.base_rate ?? row.rate ?? 0),
    spreadPercent: Number(row.spread_percent ?? 0),
    feeNgn: Number(row.fee_ngn ?? 0),
    walletAddress: row.wallet_address,
    bank: row.bank_name
      ? {
          bankName: row.bank_name,
          accountNumber: row.bank_account_number || "",
          accountName: row.bank_account_name || "",
        }
      : undefined,
    status: row.status,
    createdAt: new Date(row.created_at).getTime(),
    quoteExpiresAt: ms(row.quote_expires_at),
    paidAt: ms(row.paid_at),
    verifiedAt: ms(row.verified_at),
    reviewedAt: ms(row.reviewed_at),
    releasedAt: ms(row.released_at),
    payerName: row.payer_name ?? undefined,
    payerNote: row.payer_note ?? undefined,
    txHash: row.tx_hash ?? undefined,
    payoutTxHash: row.payout_tx_hash ?? undefined,
    paystackRef: row.paystack_ref ?? undefined,
    payoutRef: row.payout_ref ?? undefined,
    adminNote: row.admin_note ?? undefined,
    rejectionReason: row.rejection_reason ?? undefined,
    settlementRef: row.settlement_ref,
  };
}

// Bank account shown to buyers (the merchant's collection account).
export const MERCHANT_BANK: BankDetails = {
  bankName: process.env.EXCHANGE_MERCHANT_BANK_NAME || "Moniepoint MFB",
  accountNumber: process.env.EXCHANGE_MERCHANT_ACCOUNT_NUMBER || "8123456789",
  accountName: process.env.EXCHANGE_MERCHANT_ACCOUNT_NAME || "VERIPAY LIQUIDITY LTD",
};

const MONAD_RPC = process.env.MONAD_RPC_URL || process.env.NEXT_PUBLIC_MONAD_RPC_URL || "https://testnet-rpc.monad.xyz";
const MONAD_CHAIN = {
  id: 10143,
  name: "Monad Testnet",
  nativeCurrency: { name: "MON", symbol: "MON", decimals: 18 },
  rpcUrls: { default: { http: [MONAD_RPC] }, public: { http: [MONAD_RPC] } },
};

/** Where sellers send their MON. */
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

export function hasHotWallet(): boolean {
  return Boolean(process.env.EXCHANGE_PAYOUT_PRIVATE_KEY);
}

function makeId(): string {
  const chars = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  let s = "";
  for (let i = 0; i < 6; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

// ─── Audit trail ────────────────────────────────────────────────────────────

export async function logOrderEvent(orderId: string, actor: string, action: string, detail?: string) {
  if (!isSupabaseConfigured()) return;
  await supabaseAdmin
    .from("exchange_order_events")
    .insert({ order_id: orderId, actor, action, detail })
    .then(undefined, () => { /* auditing must never break the flow */ });
}

export async function listOrderEvents(orderId: string) {
  if (!isSupabaseConfigured()) return [];
  const { data } = await supabaseAdmin
    .from("exchange_order_events")
    .select()
    .eq("order_id", orderId.toUpperCase())
    .order("created_at", { ascending: true });
  return data ?? [];
}

// ─── Creation ───────────────────────────────────────────────────────────────

export type CreateOrderInput = {
  side: OrderSide;
  paymentMethod: PaymentMethod;
  coin: string;
  coinName: string;
  amountCrypto: number;
  amountNgn: number;
  exactAmountNgn: number;
  rate: number;
  baseRate: number;
  spreadPercent: number;
  feeNgn: number;
  walletAddress: string;
  bank?: BankDetails;
  quoteTtlMs: number;
};

export async function createOrder(input: CreateOrderInput): Promise<ExchangeOrder> {
  if (!isSupabaseConfigured()) {
    throw new Error(
      "Order storage is not configured on this server — SUPABASE_SERVICE_ROLE_KEY is missing from the environment."
    );
  }

  const id = makeId();
  const settlementRef = `VP-${id}-${new Date().getFullYear()}`;

  const { data, error } = await supabaseAdmin
    .from("exchange_orders")
    .insert({
      id,
      side: input.side,
      payment_method: input.paymentMethod,
      coin: input.coin,
      coin_name: input.coinName,
      amount_crypto: input.amountCrypto,
      amount_ngn: input.amountNgn,
      exact_amount_ngn: input.exactAmountNgn,
      rate: input.rate,
      base_rate: input.baseRate,
      spread_percent: input.spreadPercent,
      fee_ngn: input.feeNgn,
      wallet_address: input.walletAddress,
      bank_name: input.bank?.bankName,
      bank_account_number: input.bank?.accountNumber,
      bank_account_name: input.bank?.accountName,
      status: "awaiting_payment",
      quote_expires_at: new Date(Date.now() + input.quoteTtlMs).toISOString(),
      settlement_ref: settlementRef,
    })
    .select()
    .single();

  if (error || !data) {
    console.error("createOrder error:", error?.message);
    throw new Error("Failed to create order");
  }

  await logOrderEvent(
    id,
    input.walletAddress,
    "order_created",
    `${input.side} ${input.amountCrypto} ${input.coin} @ ₦${input.rate.toFixed(2)} via ${input.paymentMethod}`
  );

  return rowToOrder(data as OrderRow);
}

// ─── Crypto payout (buy leg) ────────────────────────────────────────────────

const payoutInFlight = new Set<string>();

/**
 * Send the purchased MON from the platform hot wallet.
 * Returns the tx hash, or undefined when no hot wallet is configured (in which
 * case the admin settles manually and records their own hash).
 */
export async function payoutCrypto(order: ExchangeOrder): Promise<string | undefined> {
  const pk = process.env.EXCHANGE_PAYOUT_PRIVATE_KEY;
  if (!pk || order.coin !== "MON" || order.payoutTxHash) return order.payoutTxHash;
  if (payoutInFlight.has(order.id)) return undefined;

  payoutInFlight.add(order.id);
  try {
    const account = privateKeyToAccount(pk as `0x${string}`);
    const walletClient = createWalletClient({
      account,
      chain: MONAD_CHAIN as any,
      transport: http(MONAD_RPC),
    });
    const publicClient = createPublicClient({
      chain: MONAD_CHAIN as any,
      transport: http(MONAD_RPC),
    });

    const hash = await walletClient.sendTransaction({
      to: order.walletAddress as `0x${string}`,
      value: parseEther(order.amountCrypto.toFixed(18)),
      chain: MONAD_CHAIN as any,
    });
    await publicClient.waitForTransactionReceipt({ hash, confirmations: 1 });
    return hash;
  } catch (err) {
    console.error(`Payout failed for order ${order.id}:`, err);
    throw new Error(
      err instanceof Error
        ? `On-chain payout failed: ${err.message.slice(0, 160)}`
        : "On-chain payout failed"
    );
  } finally {
    payoutInFlight.delete(order.id);
  }
}

// ─── Reads ──────────────────────────────────────────────────────────────────

/**
 * Lapse a quote that was never paid. This is the ONLY automatic status change
 * in the system, and it can only ever move an order backwards (to expired) —
 * it never releases funds.
 */
async function expireIfLapsed(order: ExchangeOrder): Promise<ExchangeOrder> {
  if (
    order.status === "awaiting_payment" &&
    order.quoteExpiresAt &&
    Date.now() > order.quoteExpiresAt
  ) {
    if (isSupabaseConfigured()) {
      await supabaseAdmin.from("exchange_orders").update({ status: "expired" }).eq("id", order.id);
    }
    await logOrderEvent(order.id, "system", "expired", "Locked quote lapsed before payment");
    return { ...order, status: "expired" };
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
  return expireIfLapsed(rowToOrder(data as OrderRow));
}

export async function listOrdersByAddress(address: string): Promise<ExchangeOrder[]> {
  if (!isSupabaseConfigured()) return [];

  const { data, error } = await supabaseAdmin
    .from("exchange_orders")
    .select()
    .ilike("wallet_address", address)
    .order("created_at", { ascending: false })
    .limit(50);

  if (error || !data) return [];
  return Promise.all((data as OrderRow[]).map((r) => expireIfLapsed(rowToOrder(r))));
}

export async function listAllOrders(): Promise<ExchangeOrder[]> {
  if (!isSupabaseConfigured()) return [];

  const { data, error } = await supabaseAdmin
    .from("exchange_orders")
    .select()
    .order("created_at", { ascending: false })
    .limit(200);

  if (error || !data) return [];
  return Promise.all((data as OrderRow[]).map((r) => expireIfLapsed(rowToOrder(r))));
}

// ─── Writes ─────────────────────────────────────────────────────────────────

export type OrderPatch = Partial<{
  status: OrderStatus;
  paidAt: number;
  verifiedAt: number;
  reviewedAt: number;
  releasedAt: number;
  txHash: string;
  payoutTxHash: string;
  payerName: string;
  payerNote: string;
  paystackRef: string;
  payoutRef: string;
  adminNote: string;
  rejectionReason: string;
}>;

const COLUMN: Record<keyof OrderPatch, string> = {
  status: "status",
  paidAt: "paid_at",
  verifiedAt: "verified_at",
  reviewedAt: "reviewed_at",
  releasedAt: "released_at",
  txHash: "tx_hash",
  payoutTxHash: "payout_tx_hash",
  payerName: "payer_name",
  payerNote: "payer_note",
  paystackRef: "paystack_ref",
  payoutRef: "payout_ref",
  adminNote: "admin_note",
  rejectionReason: "rejection_reason",
};

const TIMESTAMP_FIELDS = new Set(["paidAt", "verifiedAt", "reviewedAt", "releasedAt"]);

export async function updateOrder(id: string, patch: OrderPatch): Promise<ExchangeOrder | undefined> {
  if (!isSupabaseConfigured()) return undefined;

  const updates: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) continue;
    const column = COLUMN[key as keyof OrderPatch];
    if (!column) continue;
    updates[column] = TIMESTAMP_FIELDS.has(key) ? new Date(value as number).toISOString() : value;
  }
  if (Object.keys(updates).length === 0) return getOrder(id);

  const { data, error } = await supabaseAdmin
    .from("exchange_orders")
    .update(updates)
    .eq("id", id.toUpperCase())
    .select()
    .single();

  if (error || !data) {
    console.error("updateOrder error:", error?.message);
    return undefined;
  }
  return rowToOrder(data as OrderRow);
}

/**
 * Claim an order for settlement, atomically.
 *
 * The status guard lives in the WHERE clause, so two admins double-clicking
 * "release" at the same moment cannot both win — the second update matches no
 * rows and returns undefined. Same protection against a replayed webhook.
 */
export async function transitionOrder(
  id: string,
  fromStatuses: OrderStatus[],
  patch: OrderPatch
): Promise<ExchangeOrder | undefined> {
  if (!isSupabaseConfigured()) return undefined;

  const updates: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) continue;
    const column = COLUMN[key as keyof OrderPatch];
    if (!column) continue;
    updates[column] = TIMESTAMP_FIELDS.has(key) ? new Date(value as number).toISOString() : value;
  }

  const { data, error } = await supabaseAdmin
    .from("exchange_orders")
    .update(updates)
    .eq("id", id.toUpperCase())
    .in("status", fromStatuses)
    .select()
    .maybeSingle();

  if (error || !data) return undefined;
  return rowToOrder(data as OrderRow);
}
