import { NextResponse } from "next/server";
import {
  getOrder,
  transitionOrder,
  updateOrder,
  logOrderEvent,
  payoutCrypto,
  hasHotWallet,
} from "@/lib/exchangeStore";
import { isValidWebhookSignature } from "@/lib/paystack";

export const dynamic = "force-dynamic";

// Paystack server-to-server callback. This is the safety net: if the customer
// closes the tab before the browser can call /card/verify, the charge still
// settles from here.
//
// Point Paystack at:  https://<your-domain>/api/exchange/card/webhook
export async function POST(request: Request) {
  const raw = await request.text();
  const signature = request.headers.get("x-paystack-signature");

  if (!(await isValidWebhookSignature(raw, signature))) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  try {
    const event = JSON.parse(raw);
    if (event.event !== "charge.success") {
      return NextResponse.json({ received: true });
    }

    const orderId = event.data?.metadata?.orderId as string | undefined;
    const reference = event.data?.reference as string | undefined;
    const paidNgn = Number(event.data?.amount ?? 0) / 100;

    if (!orderId || !reference) return NextResponse.json({ received: true });

    const order = await getOrder(orderId);
    if (!order || order.status === "completed") return NextResponse.json({ received: true });

    if (paidNgn + 1 < order.exactAmountNgn) {
      await logOrderEvent(order.id, "paystack", "webhook_underpaid", `₦${paidNgn}`);
      return NextResponse.json({ received: true });
    }

    const claimed = await transitionOrder(order.id, ["awaiting_payment", "expired", "payment_review"], {
      status: "verified",
      paidAt: Date.now(),
      verifiedAt: Date.now(),
      paystackRef: reference,
    });

    if (!claimed) return NextResponse.json({ received: true }); // already handled

    await logOrderEvent(order.id, "paystack", "card_charge_verified", `webhook · ref ${reference}`);

    if (hasHotWallet()) {
      try {
        const payoutTxHash = await payoutCrypto(claimed);
        await updateOrder(order.id, { status: "completed", payoutTxHash, releasedAt: Date.now() });
        await logOrderEvent(order.id, "system", "crypto_released", payoutTxHash);
      } catch (err) {
        await logOrderEvent(order.id, "system", "payout_failed", err instanceof Error ? err.message : "unknown");
      }
    }

    return NextResponse.json({ received: true });
  } catch (err) {
    console.error("Paystack webhook error:", err);
    return NextResponse.json({ received: true });
  }
}
