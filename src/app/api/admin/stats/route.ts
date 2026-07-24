import { NextResponse } from "next/server";
import { supabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";
import { formatEther } from "viem";

const ADMIN_PASSCODE = process.env.ADMIN_PASSCODE || "lagos-admin";

function isAuthorized(request: Request): boolean {
  return request.headers.get("x-admin-code") === ADMIN_PASSCODE;
}

// ─── GET /api/admin/stats — platform-wide usage metrics ─────────────────────
export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Invalid admin passcode" }, { status: 401 });
  }

  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Persistence not configured" }, { status: 503 });
  }

  const [
    usersCount,
    tradesRes,
    settledTradesCount,
    exchangeOrdersRes,
    completedOrdersCount,
    messagesCount,
    pageViews7d,
    connects24h,
  ] = await Promise.all([
    supabaseAdmin.from("app_users").select("*", { count: "exact", head: true }),
    supabaseAdmin.from("escrow_trades").select("amount_wei, status"),
    supabaseAdmin.from("escrow_trades").select("*", { count: "exact", head: true }).eq("status", "settled"),
    supabaseAdmin.from("exchange_orders").select("amount_ngn, side, status"),
    supabaseAdmin.from("exchange_orders").select("*", { count: "exact", head: true }).eq("status", "completed"),
    supabaseAdmin.from("chat_messages").select("*", { count: "exact", head: true }),
    supabaseAdmin
      .from("page_views")
      .select("*", { count: "exact", head: true })
      .gte("created_at", new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()),
    supabaseAdmin
      .from("wallet_events")
      .select("*", { count: "exact", head: true })
      .eq("event_type", "connect")
      .gte("created_at", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()),
  ]);

  const trades = tradesRes.data ?? [];
  const totalVolumeWei = trades.reduce((sum, t) => sum + BigInt(t.amount_wei ?? 0), BigInt(0));

  const orders = exchangeOrdersRes.data ?? [];
  const totalOrderNgn = orders.reduce((sum, o) => sum + Number(o.amount_ngn ?? 0), 0);
  const buyOrders = orders.filter((o) => o.side === "buy").length;
  const sellOrders = orders.filter((o) => o.side === "sell").length;

  return NextResponse.json({
    uniqueWallets: usersCount.count ?? 0,
    walletConnects24h: connects24h.count ?? 0,
    totalTrades: trades.length,
    settledTrades: settledTradesCount.count ?? 0,
    totalVolumeMon: formatEther(totalVolumeWei),
    totalExchangeOrders: orders.length,
    completedExchangeOrders: completedOrdersCount.count ?? 0,
    buyOrders,
    sellOrders,
    totalExchangeVolumeNgn: totalOrderNgn,
    totalChatMessages: messagesCount.count ?? 0,
    pageViews7d: pageViews7d.count ?? 0,
  });
}
