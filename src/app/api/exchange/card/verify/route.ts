import { NextResponse } from "next/server";
import {
  getOrder,
  transitionOrder,
  updateOrder,
  logOrderEvent,
  payoutCrypto,
  hasHotWallet,
} from "@/lib/exchangeStore";
import { verifyTransaction } from "@/lib/paystack";

export const dynamic = "force-dynamic";

// POST /api/exchange/card/verify  { id, reference }
//
// The browser tells us a charge finished; we ask Paystack whether that's true.
// Only Paystack's answer moves the order.
export async function POST(request: Request) {
  try {
    const { id, reference } = await request.json();

    const order = await getOrder(String(id || ""));
    if (!order) return NextResponse.json({ error: "Order not found" }, { status: 404 });

    if (order.status === "completed") {
      return NextResponse.json({ order }); // idempotent: already settled
    }
    if (order.side !== "buy" || order.paymentMethod !== "card") {
      return NextResponse.json({ error: "This order isn't a card purchase." }, { status: 400 });
    }

    const ref = String(reference || "").trim();
    if (!ref) return NextResponse.json({ error: "Missing payment reference." }, { status: 400 });

    const result = await verifyTransaction(ref, order.exactAmountNgn);
    if (!result.ok) {
      await logOrderEvent(order.id, "paystack", "card_verification_failed", result.error);
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    // Claim the order atomically. The unique index on paystack_ref also stops
    // the same charge from ever settling a second order.
    const claimed = await transitionOrder(order.id, ["awaiting_payment", "expired", "payment_review"], {
      status: "verified",
      paidAt: Date.now(),
      verifiedAt: Date.now(),
      paystackRef: ref,
      adminNote: result.demo ? "TEST MODE card charge — no real money moved" : undefined,
    });

    if (!claimed) {
      const current = await getOrder(order.id);
      return NextResponse.json({ order: current });
    }

    await logOrderEvent(
      order.id,
      "paystack",
      result.demo ? "card_charge_simulated" : "card_charge_verified",
      `₦${result.amountNgn.toLocaleString("en-NG")} via ${result.channel} · ref ${ref}`
    );

    // Card payments are self-verifying, so release immediately when we can.
    if (hasHotWallet()) {
      try {
        const payoutTxHash = await payoutCrypto(claimed);
        const completed = await updateOrder(order.id, {
          status: "completed",
          payoutTxHash,
          releasedAt: Date.now(),
        });
        await logOrderEvent(order.id, "system", "crypto_released", payoutTxHash);
        return NextResponse.json({ order: completed });
      } catch (err) {
        await logOrderEvent(order.id, "system", "payout_failed", err instanceof Error ? err.message : "unknown");
        // Money is in but coin didn't go out — leave it verified for the admin.
        return NextResponse.json({
          order: claimed,
          warning: "Payment confirmed. Delivery is queued and an agent is completing it now.",
        });
      }
    }

    return NextResponse.json({
      order: claimed,
      warning: "Payment confirmed. Your crypto is being released now.",
    });
  } catch (err) {
    console.error("Card verify error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
