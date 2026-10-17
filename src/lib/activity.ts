// The platform's activity record for the admin console: who is using it, what
// they did, and what moved on-chain. Server-only.
//
// Sources, and why each:
//   · the escrow contract — orders, amounts, outcomes (the source of truth)
//   · sellers / pay_intents — links claimed, card payments started and funded
//   · trade_activity — releases and refunds, with their transaction hashes
//   · app_users / wallet_events / page_views — sign-ins and traffic
// Nothing here is shown publicly; emails are never included.

import { createPublicClient, formatEther, formatUnits, http } from "viem";
import { supabaseAdmin } from "@/lib/supabase";
import { readAllTrades } from "@/lib/reputation";
import { formatTradeAmount } from "@/lib/escrow";
import { NGN_TOKEN_ADDRESS, NGN_TOKEN_DECIMALS } from "@/lib/monad";
import { paymentsStatus } from "@/lib/payments";

const RPC = process.env.MONAD_RPC_URL || process.env.NEXT_PUBLIC_MONAD_RPC_URL || "https://testnet-rpc.monad.xyz";
const DAY = 86_400_000;
const GAS_PER_NEW_BUYER = 0.15; // MON — see GAS_TOPUP in payments.ts

export type ActivityEvent = {
  at: string;          // ISO time
  kind: "seller" | "payment" | "order" | "release" | "refund" | "dispute" | "signin";
  text: string;        // plain-language description
  who: string;         // shop name or shortened address
  amount?: string;     // "₦5,000"
  href?: string;       // where to look: /trade/id or /proof/tx
};

const short = (a?: string | null) => (a ? `${a.slice(0, 6)}…${a.slice(-4)}`.toLowerCase() : "—");
const naira = (n: number) => `₦${n.toLocaleString("en-NG", { maximumFractionDigits: 2 })}`;
const dayKey = (d: Date) => d.toISOString().slice(0, 10);

export async function buildActivity() {
  const since14 = new Date(Date.now() - 14 * DAY).toISOString();
  const [sellersRes, intentsRes, activityRes, usersRes, signinsRes, views7Res, trades] = await Promise.all([
    supabaseAdmin.from("sellers").select("handle, name, address, created_at, gas_topups"),
    supabaseAdmin.from("pay_intents").select("id, handle, buyer_address, amount_ngn, item, status, created_at, paid_at, gas_topups"),
    supabaseAdmin.from("trade_activity").select("trade_id, actor_address, action, tx_hash, created_at").order("created_at", { ascending: false }).limit(200),
    supabaseAdmin.from("app_users").select("wallet_address"),
    supabaseAdmin.from("wallet_events").select("wallet_address, created_at").eq("event_type", "connect").gte("created_at", since14).order("created_at", { ascending: false }).limit(200),
    supabaseAdmin.from("page_views").select("*", { count: "exact", head: true }).gte("created_at", new Date(Date.now() - 7 * DAY).toISOString()),
    readAllTrades().catch(() => [] as Awaited<ReturnType<typeof readAllTrades>>),
  ]);

  const sellers = sellersRes.data ?? [];
  const intents = intentsRes.data ?? [];
  const shopOf = new Map(sellers.map((s) => [s.address.toLowerCase(), s.name as string]));
  const who = (addr: string) => shopOf.get(addr.toLowerCase()) ?? short(addr);

  // ── People ──────────────────────────────────────────────────────────────
  const people = new Set<string>();
  for (const u of usersRes.data ?? []) people.add(u.wallet_address.toLowerCase());
  for (const s of sellers) people.add(s.address.toLowerCase());
  for (const i of intents) people.add(i.buyer_address.toLowerCase());
  for (const { t } of trades) { people.add(t.buyer.toLowerCase()); people.add(t.seller.toLowerCase()); }

  // ── Orders on-chain ─────────────────────────────────────────────────────
  const isNgn = (token: string) => token.toLowerCase() === NGN_TOKEN_ADDRESS.toLowerCase();
  const ngn = (amount: bigint) => Number(formatUnits(amount, NGN_TOKEN_DECIMALS));
  let open = 0, paidOut = 0, refunded = 0, disputed = 0, lockedNgn = 0, paidOutNgn = 0, totalNgn = 0, feesNgn = 0;
  for (const { t } of trades) {
    const settled = t.released || t.refunded;
    if (!settled) open++;
    if (t.released) paidOut++;
    if (t.refunded) refunded++;
    if (t.disputed) disputed++;
    if (isNgn(t.token)) {
      const v = ngn(t.amount);
      totalNgn += v;
      if (!settled) lockedNgn += v;
      if (t.released && !t.refunded) { paidOutNgn += v; feesNgn += (v * t.feeBps) / 10_000; }
    }
  }

  // ── Operations: the wallet that pays everyone's network fees ────────────
  let feeWallet: { address: string; mon: number; buyersLeft: number } | null = null;
  const delivery = paymentsStatus().deliveryAddress;
  if (delivery) {
    try {
      const bal = await createPublicClient({ transport: http(RPC) }).getBalance({ address: delivery as `0x${string}` });
      const mon = Number(formatEther(bal));
      feeWallet = { address: delivery, mon, buyersLeft: Math.floor(mon / GAS_PER_NEW_BUYER) };
    } catch { /* shown as unknown */ }
  }
  const topups = intents.reduce((n, i) => n + (i.gas_topups ?? 0), 0) + sellers.reduce((n, s) => n + (s.gas_topups ?? 0), 0);

  // ── Feed ────────────────────────────────────────────────────────────────
  const feed: ActivityEvent[] = [];
  for (const s of sellers) feed.push({ at: s.created_at, kind: "seller", text: `New seller claimed veripay.store/pay/${s.handle}`, who: s.name });
  for (const i of intents) {
    feed.push({ at: i.created_at, kind: "payment", text: `Card payment started for "${i.item}"`, who: `buyer ${short(i.buyer_address)} → ${i.handle}`, amount: naira(Number(i.amount_ngn)) });
    if (i.status === "funded" && i.paid_at) feed.push({ at: i.paid_at, kind: "payment", text: `Card payment verified — naira issued to the buyer`, who: `buyer ${short(i.buyer_address)} → ${i.handle}`, amount: naira(Number(i.amount_ngn)) });
  }
  for (const { id, t } of trades) {
    if (!t.createdAt) continue;
    const { display } = formatTradeAmount(t);
    feed.push({ at: new Date(Number(t.createdAt) * 1000).toISOString(), kind: "order", text: `Order #${id} locked on Monad — "${t.metadata}"`, who: `${short(t.buyer)} → ${who(t.seller)}`, amount: display, href: `/trade/${id}` });
    if (t.disputed) feed.push({ at: new Date(Number(t.createdAt) * 1000 + 1000).toISOString(), kind: "dispute", text: `A problem was reported on order #${id}`, who: who(t.seller), amount: display, href: `/trade/${id}` });
  }
  for (const a of activityRes.data ?? []) {
    if (a.action === "created") continue; // the chain entry above is the record
    const label = a.action === "released" ? `Order #${a.trade_id} paid out to the seller`
      : a.action === "refund_approved" ? `Seller approved a refund on order #${a.trade_id}`
      : `Buyer took the refund on order #${a.trade_id}`;
    feed.push({ at: a.created_at, kind: a.action === "released" ? "release" : "refund", text: label, who: `by ${who(a.actor_address)}`, href: a.tx_hash ? `/proof/${a.tx_hash}` : `/trade/${a.trade_id}` });
  }
  for (const w of signinsRes.data ?? []) feed.push({ at: w.created_at, kind: "signin", text: "Signed in", who: who(w.wallet_address) });
  feed.sort((a, b) => (a.at < b.at ? 1 : -1));

  // ── Last 14 days ────────────────────────────────────────────────────────
  const days = Array.from({ length: 14 }, (_, k) => dayKey(new Date(Date.now() - (13 - k) * DAY)));
  const blank = () => Object.fromEntries(days.map((d) => [d, 0])) as Record<string, number>;
  const series = { orders: blank(), payments: blank(), sellers: blank() };
  for (const e of feed) {
    const d = e.at.slice(0, 10);
    if (!(d in series.orders)) continue;
    if (e.kind === "order") series.orders[d]++;
    else if (e.kind === "seller") series.sellers[d]++;
    else if (e.kind === "payment" && e.text.startsWith("Card payment verified")) series.payments[d]++;
  }

  return {
    generatedAt: new Date().toISOString(),
    totals: {
      people: people.size,
      sellers: sellers.length,
      paymentsStarted: intents.length,
      paymentsFunded: intents.filter((i) => i.status === "funded").length,
      orders: trades.length, open, paidOut, refunded, disputed,
      lockedNgn, paidOutNgn, totalNgn, feesNgn,
      pageViews7d: views7Res.count ?? 0,
    },
    ops: { feeWallet, gasTopupsSent: topups },
    series: days.map((d) => ({ day: d, orders: series.orders[d], payments: series.payments[d], sellers: series.sellers[d] })),
    feed: feed.slice(0, 500),
  };
}

/** The full record as CSV, for keeping or opening in a spreadsheet. */
export function toCsv(feed: ActivityEvent[]): string {
  const cell = (v?: string) => `"${(v ?? "").replace(/"/g, '""')}"`;
  return ["time,type,what happened,who,amount,link",
    ...feed.map((e) => [e.at, e.kind, e.text, e.who, e.amount, e.href ? `https://veripay.store${e.href}` : ""].map(cell).join(","))].join("\n");
}
