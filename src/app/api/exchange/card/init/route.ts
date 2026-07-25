import { NextResponse } from "next/server";
import { getOrder } from "@/lib/exchangeStore";
import { initTransaction, paystackPublicKey, paystackConfigured } from "@/lib/paystack";

export const dynamic = "force-dynamic";

// POST /api/exchange/card/init  { id, email }
// Opens a Paystack charge for the order's exact amount. The amount comes from
// the stored order, never from the request body.
export async function POST(request: Request) {
  try {
    const { id, email } = await request.json();

    const order = await getOrder(String(id || ""));
    if (!order) return NextResponse.json({ error: "Order not found" }, { status: 404 });

    if (order.side !== "buy" || order.paymentMethod !== "card") {
      return NextResponse.json({ error: "This order isn't a card purchase." }, { status: 400 });
    }
    if (order.status !== "awaiting_payment") {
      return NextResponse.json({ error: "This order is no longer awaiting payment." }, { status: 409 });
    }

    const payerEmail = String(email || "").trim();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(payerEmail)) {
      return NextResponse.json({ error: "Enter a valid email for your receipt." }, { status: 400 });
    }

    const result = await initTransaction({
      orderId: order.id,
      amountNgn: order.exactAmountNgn,
      email: payerEmail,
    });

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 502 });
    }

    return NextResponse.json({
      ...result,
      publicKey: paystackPublicKey(),
      configured: paystackConfigured(),
      amountNgn: order.exactAmountNgn,
    });
  } catch (err) {
    console.error("Card init error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
