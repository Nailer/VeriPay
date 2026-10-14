// Pay-link payments: a buyer pays naira by card, and exactly that amount is
// put in their account as vNGN (plus a little gas), ready to lock in escrow.
//
// The order of operations is the whole point:
//   1. Paystack — not the browser — confirms the charge and its amount.
//   2. The intent is claimed with a status guard in the SQL WHERE clause, and
//      paystack_ref is unique, so one charge can never fund two payments.
//   3. Only then do tokens move.
//
// TESTNET: vNGN is a test token and the Paystack keys are test keys. No real
// money moves. See contracts/test/VeriPayTestNaira.sol.

import { createPublicClient, createWalletClient, http, parseEther, parseUnits } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { supabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";
import { verifyTransaction, paystackPublicKey, paystackConfigured } from "@/lib/paystack";
import { getSellerByHandle } from "@/lib/sellers";
import { getReputation } from "@/lib/reputation";
import { NGN_TOKEN_ADDRESS, NGN_TOKEN_DECIMALS } from "@/lib/monad";

export const PAY_MIN_NGN = 100;
export const PAY_MAX_NGN = 5_000_000;

const RPC = process.env.MONAD_RPC_URL || process.env.NEXT_PUBLIC_MONAD_RPC_URL || "https://testnet-rpc.monad.xyz";
const CHAIN = { id: 10143, name: "Monad Testnet", nativeCurrency: { name: "MON", symbol: "MON", decimals: 18 }, rpcUrls: { default: { http: [RPC] } } };

// Two escrow transactions cost ~0.03 MON at current prices; a first-time
// buyer has none, so top them up rather than send them to a faucet.
const GAS_FLOOR = parseEther("0.08");
const GAS_TOPUP = parseEther("0.15");
// A payment may be topped up more than once (a top-up can fail, or a retry can
// find the account dry), but not without limit — this is our MON.
const MAX_GAS_TOPUPS = 3;

const mintAbi = [
  { type: "function", name: "mint", stateMutability: "nonpayable", inputs: [{ type: "address" }, { type: "uint256" }], outputs: [] },
] as const;

export type PayIntent = {
  id: string;
  handle: string;
  sellerAddress: string;
  buyerAddress: string;
  amountNgn: number;
  item: string;
  status: "awaiting_payment" | "paid" | "funded" | "failed";
  testMode: boolean;
};

type Row = { id: string; handle: string; seller_address: string; buyer_address: string; amount_ngn: string | number; item: string; status: PayIntent["status"]; test_mode: boolean; mint_tx: string | null; gas_topups: number };
const COLS = "id, handle, seller_address, buyer_address, amount_ngn, item, status, test_mode, mint_tx, gas_topups";
const toIntent = (r: Row): PayIntent => ({
  id: r.id, handle: r.handle, sellerAddress: r.seller_address, buyerAddress: r.buyer_address,
  amountNgn: Number(r.amount_ngn), item: r.item, status: r.status, testMode: r.test_mode,
});

type Fail = { ok: false; error: string; status: number };
const fail = (error: string, status = 400): Fail => ({ ok: false, error, status });

function makeId(): string {
  const chars = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  return Array.from({ length: 8 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
}

export async function createIntent(input: { handle: string; amountNgn: number; item: string; buyerAddress: string; email: string }) {
  if (!isSupabaseConfigured()) return fail("Storage isn't configured.", 503);

  const amountNgn = Math.round(Number(input.amountNgn) * 100) / 100;
  const item = String(input.item || "").trim().slice(0, 140);
  const email = String(input.email || "").trim();
  const buyer = String(input.buyerAddress || "").toLowerCase();

  if (!Number.isFinite(amountNgn) || amountNgn < PAY_MIN_NGN) return fail(`The minimum is ₦${PAY_MIN_NGN.toLocaleString("en-NG")}.`);
  if (amountNgn > PAY_MAX_NGN) return fail(`The maximum is ₦${PAY_MAX_NGN.toLocaleString("en-NG")}.`);
  if (item.length < 3) return fail("Say what you're buying, so you and the seller agree on it.");
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return fail("Enter a valid email for your receipt.");
  if (!/^0x[a-f0-9]{40}$/.test(buyer)) return fail("Sign in first.", 401);

  const seller = await getSellerByHandle(input.handle);
  if (!seller) return fail("That seller link doesn't exist.", 404);
  if (seller.address === buyer) return fail("You can't pay your own link.");

  // The checkout popup opens the charge itself under this reference, so it
  // must not be initialised here first — Paystack rejects a reused reference.
  // Nothing is trusted from the popup: confirmIntent() asks Paystack directly.
  const id = makeId();
  const init = { reference: `VP-${id}-${Date.now().toString(36).toUpperCase()}`, demo: !paystackConfigured() };

  const { data, error } = await supabaseAdmin.from("pay_intents").insert({
    id, handle: seller.handle, seller_address: seller.address, buyer_address: buyer,
    amount_ngn: amountNgn, item, email, test_mode: init.demo,
  }).select(COLS).single();
  if (error || !data) return fail("Couldn't start the payment. Try again.", 500);

  return { ok: true as const, intent: toIntent(data as Row), reference: init.reference, demo: init.demo, publicKey: paystackPublicKey() };
}

/** The account that owns vNGN and delivers it. Falls back to the exchange's
 *  payout wallet so a deployment that already has that key needs nothing new. */
function minterAccount() {
  const raw = process.env.PAY_MINTER_PRIVATE_KEY || process.env.EXCHANGE_PAYOUT_PRIVATE_KEY;
  if (!raw) return null;
  try {
    return privateKeyToAccount((raw.startsWith("0x") ? raw : `0x${raw}`) as `0x${string}`);
  } catch {
    return null;
  }
}

/** Non-secret readiness info, for the pay page and for diagnosing a deploy. */
export function paymentsStatus() {
  return { deliveryAddress: minterAccount()?.address ?? null, cardProcessor: paystackConfigured(), storage: isSupabaseConfigured() };
}

function chainClients() {
  const account = minterAccount();
  if (!account) throw new Error("No delivery key configured (PAY_MINTER_PRIVATE_KEY)");
  const transport = http(RPC, { retryCount: 3, timeout: 20_000 });
  return {
    account,
    pub: createPublicClient({ chain: CHAIN, transport }),
    wallet: createWalletClient({ account, chain: CHAIN, transport }),
  };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function deliver(intent: PayIntent): Promise<string> {
  const { pub, wallet } = chainClients();
  const mintTx = await wallet.writeContract({
    address: NGN_TOKEN_ADDRESS, abi: mintAbi, functionName: "mint",
    args: [intent.buyerAddress as `0x${string}`, parseUnits(intent.amountNgn.toFixed(2), NGN_TOKEN_DECIMALS)],
  });
  const receipt = await pub.waitForTransactionReceipt({ hash: mintTx, timeout: 30_000 });
  if (receipt.status !== "success") throw new Error("mint reverted");
  return mintTx;
}

/**
 * Make sure a buyer can afford the two escrow transactions. Returns whether
 * they can once this returns.
 *
 * This used to be a single best-effort send straight after the mint, and it
 * failed silently in production: the buyer was charged, held their naira, and
 * then couldn't lock it ("Signer had insufficient balance"). So it now retries
 * with a freshly read nonce, and runs again whenever a funded payment is
 * re-confirmed — which is what the page's retry button does.
 */
async function ensureGas(id: string): Promise<boolean> {
  const { data } = await supabaseAdmin.from("pay_intents").select(COLS).eq("id", id).maybeSingle();
  const row = data as Row | null;
  if (!row) return false;
  const { pub } = chainClients();
  const buyer = row.buyer_address as `0x${string}`;

  if ((await pub.getBalance({ address: buyer })) >= GAS_FLOOR) return true;
  if (row.gas_topups >= MAX_GAS_TOPUPS) return false;

  // Count the attempt first, guarded on the old value, so two concurrent
  // requests can't both send.
  const { data: claimed } = await supabaseAdmin.from("pay_intents")
    .update({ gas_topups: row.gas_topups + 1 }).eq("id", id).eq("gas_topups", row.gas_topups).select("id").maybeSingle();
  if (!claimed) return false;

  return sendGas(buyer, `intent ${id}`);
}

async function sendGas(to: `0x${string}`, what: string): Promise<boolean> {
  const { account, pub, wallet } = chainClients();
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const nonce = await pub.getTransactionCount({ address: account.address, blockTag: "pending" });
      const hash = await wallet.sendTransaction({ to, value: GAS_TOPUP, nonce });
      const receipt = await pub.waitForTransactionReceipt({ hash, timeout: 30_000 });
      if (receipt.status === "success") return true;
    } catch (err) {
      console.error(`Gas top-up attempt ${attempt + 1} failed for ${what}:`, err);
    }
    await sleep(1500);
    if ((await pub.getBalance({ address: to })) >= GAS_FLOOR) return true; // it landed after all
  }
  return false;
}

/**
 * Network fees for the actions that come *after* paying: a buyer releasing or
 * disputing days later, a seller approving a refund. Neither has ever held MON.
 *
 * Only two kinds of account qualify, and each is capped, so this can't be used
 * as a faucet: a registered seller who has actually been paid through escrow,
 * and a buyer with a card-funded payment.
 */
export async function sponsorGas(addressRaw: string): Promise<{ ready: boolean }> {
  if (!isSupabaseConfigured()) return { ready: false };
  const address = String(addressRaw || "").toLowerCase();
  if (!/^0x[a-f0-9]{40}$/.test(address)) return { ready: false };
  const { pub } = chainClients();
  if ((await pub.getBalance({ address: address as `0x${string}` })) >= GAS_FLOOR) return { ready: true };

  const { data: seller } = await supabaseAdmin.from("sellers").select("handle, gas_topups").eq("address", address).maybeSingle();
  if (seller && seller.gas_topups < MAX_GAS_TOPUPS) {
    const { reputation } = await getReputation(address);
    if (reputation.totalTrades > 0) {
      const { data: claimed } = await supabaseAdmin.from("sellers")
        .update({ gas_topups: seller.gas_topups + 1 }).eq("handle", seller.handle).eq("gas_topups", seller.gas_topups).select("handle").maybeSingle();
      if (claimed) return { ready: await sendGas(address as `0x${string}`, `seller ${seller.handle}`) };
    }
  }

  const { data: intents } = await supabaseAdmin.from("pay_intents").select("id")
    .eq("buyer_address", address).eq("status", "funded").lt("gas_topups", MAX_GAS_TOPUPS)
    .order("created_at", { ascending: false }).limit(1);
  if (intents?.[0]) return { ready: await ensureGas(intents[0].id) };

  return { ready: false };
}

/**
 * A buyer who already paid but never got as far as locking (closed the tab,
 * lost signal, hit an error) comes back holding their naira. Find that payment
 * so the page can carry on without charging them again.
 */
export async function resumeForBuyer(buyerRaw: string, handleRaw: string) {
  if (!isSupabaseConfigured()) return fail("Storage isn't configured.", 503);
  const buyer = String(buyerRaw || "").toLowerCase();
  if (!/^0x[a-f0-9]{40}$/.test(buyer)) return fail("Sign in first.", 401);
  const { data } = await supabaseAdmin.from("pay_intents").select(COLS)
    .eq("buyer_address", buyer).eq("handle", String(handleRaw || "").toLowerCase()).eq("status", "funded")
    .order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (!data) return fail("No earlier payment found.", 404);
  const gasReady = await ensureGas((data as Row).id).catch(() => false);
  return { ok: true as const, intent: toIntent(data as Row), gasReady };
}

export async function confirmIntent(idRaw: string, referenceRaw: string) {
  if (!isSupabaseConfigured()) return fail("Storage isn't configured.", 503);
  const id = String(idRaw || "").toUpperCase();
  const reference = String(referenceRaw || "").trim();

  const { data: row } = await supabaseAdmin.from("pay_intents").select(COLS).eq("id", id).maybeSingle();
  if (!row) return fail("Payment not found.", 404);
  let current = row as Row;

  if (current.status === "funded") { // idempotent — but make sure they can still afford to lock it
    const gasReady = await ensureGas(id).catch(() => false);
    return { ok: true as const, intent: toIntent(current), gasReady };
  }

  if (current.status === "awaiting_payment") {
    // The reference is minted by us as VP-<intent id>-…, so a charge made for
    // one payment can't be presented for another.
    if (!reference.startsWith(`VP-${id}-`)) return fail("That payment reference doesn't belong to this payment.");

    const result = await verifyTransaction(reference, Number(current.amount_ngn));
    if (!result.ok) return fail(result.error);

    const { data: claimed } = await supabaseAdmin.from("pay_intents")
      .update({ status: "paid", paystack_ref: reference, paid_at: new Date().toISOString() })
      .eq("id", id).eq("status", "awaiting_payment").select(COLS).maybeSingle();
    if (!claimed) {
      const { data: again } = await supabaseAdmin.from("pay_intents").select(COLS).eq("id", id).single();
      current = again as Row;
    } else {
      current = claimed as Row;
    }
  }

  if (current.status !== "paid") return { ok: true as const, intent: toIntent(current) };

  // Only one request may deliver: take the slot, or report "in progress".
  const { data: slot } = await supabaseAdmin.from("pay_intents")
    .update({ mint_tx: "pending" }).eq("id", id).eq("status", "paid").is("mint_tx", null).select(COLS).maybeSingle();
  if (!slot) return { ok: true as const, intent: toIntent(current), pending: true };

  try {
    const mintTx = await deliver(toIntent(slot as Row));
    const { data: done } = await supabaseAdmin.from("pay_intents")
      .update({ status: "funded", mint_tx: mintTx }).eq("id", id).select(COLS).single();
    const gasReady = await ensureGas(id).catch(() => false);
    return { ok: true as const, intent: toIntent(done as Row), gasReady };
  } catch (err) {
    console.error(`Delivery failed for intent ${id}:`, err);
    await supabaseAdmin.from("pay_intents").update({ mint_tx: null }).eq("id", id); // release the slot so a retry can run
    return fail("Your payment went through, but we couldn't finish setting up the escrow. Tap retry — you won't be charged again.", 502);
  }
}
