import { NextResponse } from "next/server";

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

// In-memory store keyed by lowercase wallet address
const notificationStore: Record<string, Notification[]> = {};

// ─── GET /api/notifications?address=0x... ────────────────────────────────────
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const address = searchParams.get("address")?.toLowerCase();

  if (!address) {
    return NextResponse.json({ error: "Missing address" }, { status: 400 });
  }

  const notifications = notificationStore[address] ?? [];
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

    const key = (toAddress as string).toLowerCase();

    if (!notificationStore[key]) {
      notificationStore[key] = [];
    }

    const newNotification: Notification = {
      id: Date.now(),
      type,
      tradeId,
      fromAddress,
      amount,
      message,
      read: false,
      createdAt: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    };

    notificationStore[key].unshift(newNotification); // newest first

    // Keep at most 50 notifications per user
    if (notificationStore[key].length > 50) {
      notificationStore[key] = notificationStore[key].slice(0, 50);
    }

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

    const key = address.toLowerCase();
    const store = notificationStore[key];

    if (!store) {
      return NextResponse.json({ success: true });
    }

    if (!ids || ids.length === 0) {
      // Mark ALL as read
      notificationStore[key] = store.map((n) => ({ ...n, read: true }));
    } else {
      const idSet = new Set(ids);
      notificationStore[key] = store.map((n) =>
        idSet.has(n.id) ? { ...n, read: true } : n
      );
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Notifications PATCH error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
