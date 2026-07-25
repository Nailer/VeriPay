import { NextResponse } from "next/server";
import {
  listAllOrders,
  getOrder,
  transitionOrder,
  updateOrder,
  logOrderEvent,
  listOrderEvents,
  payoutCrypto,
  hasHotWallet,
  getMerchantDepositAddress,
  MERCHANT_BANK,
} from "@/lib/exchangeStore";
import { getPricing } from "@/lib/pricing";

export const dynamic = "force-dynamic";

const ADMIN_PASSCODE = process.env.ADMIN_PASSCODE || "lagos-admin";

function authorized(request: Request): boolean {
  return request.headers.get("x-admin-code") === ADMIN_PASSCODE;
}
const unauthorized = () =>
  NextResponse.json({ error: "Invalid admin passcode" }, { status: 401 });

// ─── GET /api/admin/orders ──────────────────────────────────────────────────
// The fulfilment queue: every order, plus everything needed to settle it, plus
// a live mark-to-market on open exposure.
export async function GET(request: Request) {
  if (!authorized(request)) return unauthorized();

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");

  if (id) {
    const order = await getOrder(id);
    if (!order) return NextResponse.json({ error: "Order not found" }, { status: 404 });
    return NextResponse.json({ order, events: await listOrderEvents(id) });
  }

  const [orders, pricing] = await Promise.all([listAllOrders(), getPricing().catch(() => null)]);

  // Orders sitting in review are money at risk: the rate was locked earlier, so
  // show how far the market has moved since, per order and in aggregate.
  const withDrift = orders.map((o) => {
    const current = pricing?.coins.find((c) => c.symbol === o.coin);
    if (!current || !o.rate) return { ...o, rateDriftPercent: null as number | null };
    const nowRate = o.side === "buy" ? current.buyNgn : current.sellNgn;
    return { ...o, rateDriftPercent: ((nowRate - o.rate) / o.rate) * 100 };
  });

  const actionable = withDrift.filter(
    (o) => o.status === "payment_review" || o.status === "verified"
  );

  return NextResponse.json({
    orders: withDrift,
    queue: {
      actionable: actionable.length,
      awaitingBuyerFunds: withDrift.filter((o) => o.status === "awaiting_payment").length,
      ngnToCollect: actionable
        .filter((o) => o.side === "buy")
        .reduce((sum, o) => sum + o.exactAmountNgn, 0),
      ngnToPayOut: actionable
        .filter((o) => o.side === "sell")
        .reduce((sum, o) => sum + o.amountNgn, 0),
    },
    merchantBank: MERCHANT_BANK,
    merchantAddress: getMerchantDepositAddress(),
    hotWallet: hasHotWallet(),
    pricing: pricing
      ? { spreadPercent: pricing.spreadPercent, ngnPerUsd: pricing.ngnPerUsd, ngnRateSource: pricing.ngnRateSource, at: pricing.at }
      : null,
  });
}

// ─── POST /api/admin/orders ─────────────────────────────────────────────────
// Body: { id, action, ...fields }
//   confirm_payment  buy  — bank credit seen; release the crypto
//   mark_paid_out    sell — NGN sent to the customer; close the order
//   reject                — payment never arrived / wrong amount
export async function POST(request: Request) {
  if (!authorized(request)) return unauthorized();

  try {
    const body = await request.json();
    const id = String(body.id || "");
    const action = String(body.action || "");

    if (!id || !action) {
      return NextResponse.json({ error: "Missing id or action" }, { status: 400 });
    }

    const order = await getOrder(id);
    if (!order) return NextResponse.json({ error: "Order not found" }, { status: 404 });

    // ── BUY: admin has matched the credit in the bank statement ────────────
    if (action === "confirm_payment") {
      if (order.side !== "buy") {
        return NextResponse.json({ error: "Only buy orders are confirmed this way." }, { status: 400 });
      }

      // Claim the order first so a double-click can't pay out twice.
      const claimed = await transitionOrder(id, ["payment_review", "verified"], {
        status: "verified",
        reviewedAt: Date.now(),
        adminNote: String(body.note || "").trim().slice(0, 500) || undefined,
      });

      if (!claimed) {
        return NextResponse.json(
          { error: "This order isn't awaiting confirmation (already settled, rejected, or expired)." },
          { status: 409 }
        );
      }

      await logOrderEvent(id, "admin", "payment_confirmed", `₦${order.exactAmountNgn.toLocaleString("en-NG")} matched`);

      // Deliver the crypto: automatically if a hot wallet is configured,
      // otherwise record the hash the admin sent by hand.
      const manualHash = String(body.txHash || "").trim();
      let payoutTxHash: string | undefined = manualHash || undefined;

      if (!payoutTxHash && hasHotWallet()) {
        try {
          payoutTxHash = await payoutCrypto(claimed);
        } catch (err) {
          // Payout failed — park it back in review rather than closing it.
          await updateOrder(id, {
            status: "payment_review",
            adminNote: err instanceof Error ? err.message : "Payout failed",
          });
          await logOrderEvent(id, "admin", "payout_failed", err instanceof Error ? err.message : "unknown");
          return NextResponse.json(
            { error: err instanceof Error ? err.message : "Payout failed. Order returned to the queue." },
            { status: 502 }
          );
        }
      }

      if (!payoutTxHash && !hasHotWallet()) {
        // No hot wallet and no hash supplied: keep it in "verified" so the admin
        // knows the money is in but the coin hasn't gone out yet.
        return NextResponse.json({
          order: claimed,
          needsManualPayout: true,
          message: `Payment confirmed. Now send ${order.amountCrypto} ${order.coin} to ${order.walletAddress} and record the transaction hash.`,
        });
      }

      const completed = await updateOrder(id, {
        status: "completed",
        payoutTxHash,
        releasedAt: Date.now(),
      });

      await logOrderEvent(id, "admin", "crypto_released", payoutTxHash);
      return NextResponse.json({ order: completed });
    }

    // ── SELL: crypto already verified on-chain; admin has sent the Naira ────
    if (action === "mark_paid_out") {
      if (order.side !== "sell") {
        return NextResponse.json({ error: "Only sell orders are paid out this way." }, { status: 400 });
      }
      if (order.status !== "verified") {
        return NextResponse.json(
          { error: "This order's deposit hasn't been verified on-chain yet." },
          { status: 409 }
        );
      }

      const payoutRef = String(body.payoutRef || "").trim();
      if (payoutRef.length < 3) {
        return NextResponse.json(
          { error: "Enter your bank transfer reference, so the payout is traceable." },
          { status: 400 }
        );
      }

      const updated = await transitionOrder(id, ["verified"], {
        status: "completed",
        payoutRef,
        releasedAt: Date.now(),
        reviewedAt: Date.now(),
      });

      if (!updated) {
        return NextResponse.json({ error: "This order has already been settled." }, { status: 409 });
      }

      await logOrderEvent(id, "admin", "ngn_paid_out", `Ref ${payoutRef}`);
      return NextResponse.json({ order: updated });
    }

    // ── Reject ─────────────────────────────────────────────────────────────
    if (action === "reject") {
      const reason = String(body.reason || "").trim();
      if (reason.length < 3) {
        return NextResponse.json({ error: "Give a reason — the customer sees it." }, { status: 400 });
      }

      const updated = await transitionOrder(id, ["payment_review", "verified", "awaiting_payment", "expired"], {
        status: "rejected",
        rejectionReason: reason,
        reviewedAt: Date.now(),
      });

      if (!updated) {
        return NextResponse.json({ error: "This order can no longer be rejected." }, { status: 409 });
      }

      await logOrderEvent(id, "admin", "rejected", reason);
      return NextResponse.json({ order: updated });
    }

    // ── Record a manual on-chain payout hash after the fact ────────────────
    if (action === "record_payout_tx") {
      const txHash = String(body.txHash || "").trim();
      if (!/^0x[a-fA-F0-9]{64}$/.test(txHash)) {
        return NextResponse.json({ error: "Enter a valid transaction hash." }, { status: 400 });
      }

      const updated = await transitionOrder(id, ["verified", "payment_review"], {
        status: "completed",
        payoutTxHash: txHash,
        releasedAt: Date.now(),
      });

      if (!updated) {
        return NextResponse.json({ error: "This order isn't awaiting a payout." }, { status: 409 });
      }

      await logOrderEvent(id, "admin", "crypto_released", `manual: ${txHash}`);
      return NextResponse.json({ order: updated });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (err) {
    console.error("Admin orders POST error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
