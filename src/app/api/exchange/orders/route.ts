import { NextResponse } from "next/server";
import {
  createOrder,
  getOrder,
  listOrdersByAddress,
  updateOrderStatus,
  MERCHANT_BANK,
  getMerchantDepositAddress,
  type BankDetails,
  type OrderSide,
} from "@/lib/exchangeStore";

// ─── GET /api/exchange/orders?id=... | ?address=0x... ───────────────────────
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  const address = searchParams.get("address");

  if (id) {
    const order = await getOrder(id);
    if (!order) return NextResponse.json({ error: "Order not found" }, { status: 404 });
    return NextResponse.json({
      order,
      merchantBank: MERCHANT_BANK,
      merchantAddress: getMerchantDepositAddress(),
    });
  }

  if (address) {
    const orders = await listOrdersByAddress(address);
    return NextResponse.json({ orders });
  }

  return NextResponse.json({ error: "Missing id or address" }, { status: 400 });
}

// ─── POST /api/exchange/orders ──────────────────────────────────────────────
// Body: { side, coin, coinName, amountCrypto, amountNgn, rate, feeNgn, walletAddress, bank? }
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { side, coin, coinName, amountCrypto, amountNgn, rate, feeNgn, walletAddress, bank } =
      body as {
        side: OrderSide;
        coin: string;
        coinName: string;
        amountCrypto: number;
        amountNgn: number;
        rate: number;
        feeNgn: number;
        walletAddress: string;
        bank?: BankDetails;
      };

    if (!side || !coin || !amountCrypto || !amountNgn || !walletAddress) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }
    if (side === "sell" && (!bank?.bankName || !bank?.accountNumber || !bank?.accountName)) {
      return NextResponse.json({ error: "Bank details are required to sell" }, { status: 400 });
    }
    if (amountCrypto <= 0 || amountNgn <= 0) {
      return NextResponse.json({ error: "Invalid amount" }, { status: 400 });
    }

    const order = await createOrder({
      side,
      coin,
      coinName: coinName || coin,
      amountCrypto,
      amountNgn,
      rate: rate || amountNgn / amountCrypto,
      feeNgn: feeNgn || 0,
      walletAddress,
      bank,
    });

    return NextResponse.json({
      order,
      merchantBank: MERCHANT_BANK,
      merchantAddress: getMerchantDepositAddress(),
    });
  } catch (err) {
    console.error("Exchange order POST error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// ─── PATCH /api/exchange/orders ─────────────────────────────────────────────
// Body: { id, action: "mark_paid" | "crypto_sent" | "cancel", txHash? }
export async function PATCH(request: Request) {
  try {
    const body = await request.json();
    const { id, action, txHash } = body as { id: string; action: string; txHash?: string };

    if (!id || !action) {
      return NextResponse.json({ error: "Missing id or action" }, { status: 400 });
    }

    const order = await getOrder(id);
    if (!order) return NextResponse.json({ error: "Order not found" }, { status: 404 });

    let updated;
    if (action === "mark_paid" && order.side === "buy" && order.status === "awaiting_payment") {
      updated = await updateOrderStatus(order.id, { status: "confirming", paidAt: Date.now() });
    } else if (action === "crypto_sent" && order.side === "sell" && order.status === "awaiting_payment") {
      updated = await updateOrderStatus(order.id, { status: "confirming", paidAt: Date.now(), txHash });
    } else if (action === "cancel" && order.status === "awaiting_payment") {
      updated = await updateOrderStatus(order.id, { status: "cancelled" });
    } else {
      return NextResponse.json({ error: "Action not allowed in current status" }, { status: 400 });
    }

    return NextResponse.json({ order: updated ?? order });
  } catch (err) {
    console.error("Exchange order PATCH error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
