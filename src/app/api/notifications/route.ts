import { NextResponse } from "next/server";
import { supabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";
import { sendPushToAddress } from "@/lib/push";

export type NotificationType = "trade" | "chat";

export type Notification = {
  id: number;
  type: NotificationType;
  tradeId: string;
  fromAddress: string;
  amount?: string;      // for "trade" type
  message?: string;     // for "chat" type
  read: boolean;
  createdAt: string;
};

// ─── GET /api/notifications?address=0x... ────────────────────────────────────
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const address = searchParams.get("address")?.toLowerCase();

  if (!address) {
    return NextResponse.json({ error: "Missing address" }, { status: 400 });
  }

  if (!isSupabaseConfigured()) {
    return NextResponse.json({ notifications: [] });
  }

  const { data, error } = await supabaseAdmin
    .from("notifications")
    .select("id, type, trade_id, from_address, amount, message, read, created_at")
    .eq("to_address", address)
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) {
    console.error("Notifications GET error:", error.message);
    return NextResponse.json({ notifications: [] });
  }

  const notifications: Notification[] = (data ?? []).map((row) => ({
    id: row.id,
    type: row.type,
    tradeId: row.trade_id,
    fromAddress: row.from_address,
    amount: row.amount ?? undefined,
    message: row.message ?? undefined,
    read: row.read,
    createdAt: new Date(row.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
  }));

  return NextResponse.json({ notifications });
}

// ─── POST /api/notifications ─────────────────────────────────────────────────
// Body: { toAddress, type, tradeId, fromAddress, amount?, message? }
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { toAddress, type, tradeId, fromAddress, amount, message } = body;

    if (!toAddress || !type || !tradeId || !fromAddress) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    if (!isSupabaseConfigured()) {
      return NextResponse.json({ success: false, error: "Persistence not configured" }, { status: 503 });
    }

    const key = (toAddress as string).toLowerCase();

    const { data, error } = await supabaseAdmin
      .from("notifications")
      .insert({
        to_address: key,
        type,
        trade_id: tradeId,
        from_address: fromAddress,
        amount,
        message,
        read: false,
      })
      .select("id, type, trade_id, from_address, amount, message, read, created_at")
      .single();

    if (error || !data) {
      console.error("Notifications POST error:", error?.message);
      return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }

    const newNotification: Notification = {
      id: data.id,
      type: data.type,
      tradeId: data.trade_id,
      fromAddress: data.from_address,
      amount: data.amount ?? undefined,
      message: data.message ?? undefined,
      read: data.read,
      createdAt: new Date(data.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    };

    // Best-effort real device notification — never blocks or fails the response.
    sendPushToAddress(key, {
      title: type === "trade" ? "New Escrow Created" : `New Message · Trade #00${tradeId}`,
      body:
        type === "trade"
          ? `${fromAddress.slice(0, 8)}…${fromAddress.slice(-6)} opened a trade for ${amount ?? "?"} MON`
          : (message as string) ?? "You have a new message",
      url: `/trade/${tradeId}`,
    }).catch(() => {});

    return NextResponse.json({ success: true, notification: newNotification });
  } catch (err) {
    console.error("Notifications POST error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// ─── PATCH /api/notifications ─────────────────────────────────────────────────
// Body: { address, ids: number[] }  — marks specific notifications as read
export async function PATCH(request: Request) {
  try {
    const body = await request.json();
    const { address, ids } = body as { address: string; ids: number[] };

    if (!address) {
      return NextResponse.json({ error: "Missing address" }, { status: 400 });
    }

    if (!isSupabaseConfigured()) {
      return NextResponse.json({ success: true });
    }

    const key = address.toLowerCase();

    let query = supabaseAdmin.from("notifications").update({ read: true }).eq("to_address", key);
    if (ids && ids.length > 0) {
      query = query.in("id", ids);
    }

    const { error } = await query;
    if (error) {
      console.error("Notifications PATCH error:", error.message);
      return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Notifications PATCH error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
