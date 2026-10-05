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
import { NGN_TOKEN_ADDRESS, NGN_TOKEN_DECIMALS } from "@/lib/monad";

export const PAY_MIN_NGN = 100;
export const PAY_MAX_NGN = 5_000_000;

const RPC = process.env.MONAD_RPC_URL || process.env.NEXT_PUBLIC_MONAD_RPC_URL || "https://testnet-rpc.monad.xyz";
const CHAIN = { id: 10143, name: "Monad Testnet", nativeCurrency: { name: "MON", symbol: "MON", decimals: 18 }, rpcUrls: { default: { http: [RPC] } } };

// Two escrow transactions cost ~0.03 MON at current prices; a first-time
// buyer has none, so top them up rather than send them to a faucet.
const GAS_FLOOR = parseEther("0.06");
const GAS_TOPUP = parseEther("0.12");

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

type Row = { id: string; handle: string; seller_address: string; buyer_address: string; amount_ngn: string | number; item: string; status: PayIntent["status"]; test_mode: boolean; mint_tx: string | null };
const COLS = "id, handle, seller_address, buyer_address, amount_ngn, item, status, test_mode, mint_tx";
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

async function deliver(intent: PayIntent): Promise<string> {
  const account = minterAccount();
  if (!account) throw new Error("No delivery key configured (PAY_MINTER_PRIVATE_KEY)");
  const transport = http(RPC, { retryCount: 3, timeout: 20_000 });
  const pub = createPublicClient({ chain: CHAIN, transport });
  const wallet = createWalletClient({ account, chain: CHAIN, transport });
  const buyer = intent.buyerAddress as `0x${string}`;

  const mintTx = await wallet.writeContract({
    address: NGN_TOKEN_ADDRESS, abi: mintAbi, functionName: "mint",
    args: [buyer, parseUnits(intent.amountNgn.toFixed(2), NGN_TOKEN_DECIMALS)],
  });
  const receipt = await pub.waitForTransactionReceipt({ hash: mintTx, timeout: 30_000 });
  if (receipt.status !== "success") throw new Error("mint reverted");

  // Best-effort: a failed top-up shouldn't undo a successful delivery.
  try {
    if ((await pub.getBalance({ address: buyer })) < GAS_FLOOR) {
      const gasTx = await wallet.sendTransaction({ to: buyer, value: GAS_TOPUP });
      await pub.waitForTransactionReceipt({ hash: gasTx, timeout: 30_000 });
    }
  } catch (err) {
    console.error(`Gas top-up failed for intent ${intent.id}:`, err);
  }
  return mintTx;
}

export async function confirmIntent(idRaw: string, referenceRaw: string) {
  if (!isSupabaseConfigured()) return fail("Storage isn't configured.", 503);
  const id = String(idRaw || "").toUpperCase();
  const reference = String(referenceRaw || "").trim();

  const { data: row } = await supabaseAdmin.from("pay_intents").select(COLS).eq("id", id).maybeSingle();
  if (!row) return fail("Payment not found.", 404);
  let current = row as Row;

  if (current.status === "funded") return { ok: true as const, intent: toIntent(current) }; // idempotent

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
    return { ok: true as const, intent: toIntent(done as Row) };
  } catch (err) {
    console.error(`Delivery failed for intent ${id}:`, err);
    await supabaseAdmin.from("pay_intents").update({ mint_tx: null }).eq("id", id); // release the slot so a retry can run
    return fail("Your payment went through, but we couldn't finish setting up the escrow. Tap retry — you won't be charged again.", 502);
  }
}
