// Seller pay-links: a handle a vendor can put in their Instagram bio
// (veripay.store/pay/<handle>) that resolves to their payout address, so a
// buyer never has to see or paste a wallet address.

import { verifyMessage } from "viem";
import { supabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";
import { claimMessage, normaliseHandle } from "@/lib/sellerShared";

export type Seller = { handle: string; name: string; address: string };

const HANDLE_RE = /^[a-z0-9][a-z0-9_-]{2,29}$/;
const RESERVED = new Set(["admin", "api", "pay", "sell", "seller", "veripay", "support", "help", "dashboard", "exchange", "create", "trade", "install", "orders"]);

export async function getSellerByHandle(handle: string): Promise<Seller | null> {
  if (!isSupabaseConfigured()) return null;
  const { data } = await supabaseAdmin.from("sellers").select("handle, name, address").eq("handle", normaliseHandle(handle)).maybeSingle();
  return data ?? null;
}

export async function getSellerByAddress(address: string): Promise<Seller | null> {
  if (!isSupabaseConfigured()) return null;
  const { data } = await supabaseAdmin.from("sellers").select("handle, name, address").eq("address", address.toLowerCase()).maybeSingle();
  return data ?? null;
}

export async function registerSeller(input: { handle: string; name: string; address: string; signature: string }):
  Promise<{ ok: true; seller: Seller } | { ok: false; error: string; status: number }> {
  if (!isSupabaseConfigured()) return { ok: false, error: "Storage isn't configured.", status: 503 };

  const handle = normaliseHandle(input.handle);
  const name = input.name.trim();
  const address = input.address.toLowerCase();

  if (!HANDLE_RE.test(handle) || RESERVED.has(handle)) {
    return { ok: false, error: "Pick a link name of 3–30 letters, numbers, dashes or underscores.", status: 400 };
  }
  if (name.length < 2 || name.length > 60) return { ok: false, error: "Enter your shop name.", status: 400 };
  if (!/^0x[a-f0-9]{40}$/.test(address)) return { ok: false, error: "Invalid address.", status: 400 };

  // Without this, anyone could register a link that pays out to someone
  // else's address — or squat a link under an address they don't control.
  const valid = await verifyMessage({
    address: address as `0x${string}`,
    message: claimMessage(handle, address),
    signature: input.signature as `0x${string}`,
  }).catch(() => false);
  if (!valid) return { ok: false, error: "We couldn't confirm you control that account. Try again.", status: 401 };

  if (await getSellerByAddress(address)) return { ok: false, error: "This account already has a payment link.", status: 409 };

  const { data, error } = await supabaseAdmin.from("sellers").insert({ handle, name, address }).select("handle, name, address").single();
  if (error) {
    const taken = error.code === "23505";
    return { ok: false, error: taken ? "That link name is taken — try another." : "Couldn't save your link. Try again.", status: taken ? 409 : 500 };
  }
  return { ok: true, seller: data };
}
