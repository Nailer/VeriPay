import { NextResponse } from "next/server";
import {
  createOrder,
  getOrder,
  listOrdersByAddress,
  transitionOrder,
  logOrderEvent,
  MERCHANT_BANK,
  getMerchantDepositAddress,
  type BankDetails,
  type OrderSide,
  type PaymentMethod,
} from "@/lib/exchangeStore";
import {
  quoteBuy,
  quoteSell,
  MIN_ORDER_NGN,
  MAX_ORDER_NGN,
  QUOTE_TTL_MS,
  SUPPORTED_SYMBOLS,
} from "@/lib/pricing";
import { verifyDeposit } from "@/lib/chainVerify";

export const dynamic = "force-dynamic";

const ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;

/** Fields safe to hand back to whoever holds the order link. */
function publicOrder(order: Awaited<ReturnType<typeof getOrder>>) {
  return order;
}

// ─── GET /api/exchange/orders?id=… | ?address=0x… ───────────────────────────
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  const address = searchParams.get("address");

  if (id) {
    const order = await getOrder(id);
    if (!order) return NextResponse.json({ error: "Order not found" }, { status: 404 });
    return NextResponse.json({
      order: publicOrder(order),
      merchantBank: MERCHANT_BANK,
      merchantAddress: getMerchantDepositAddress(),
    });
  }

  if (address) {
    if (!ADDRESS_RE.test(address)) {
      return NextResponse.json({ error: "Invalid address" }, { status: 400 });
    }
    return NextResponse.json({ orders: await listOrdersByAddress(address) });
  }

  return NextResponse.json({ error: "Missing id or address" }, { status: 400 });
}

// ─── POST /api/exchange/orders ──────────────────────────────────────────────
//
// The client sends only *intent* — which coin, how much, where to deliver.
// Price, fees and the crypto amount are computed here from live markets, so a
// tampered request can't mint a favourable rate.
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const side = body.side as OrderSide;
    const paymentMethod: PaymentMethod = body.paymentMethod === "card" ? "card" : "transfer";
    const coin = String(body.coin || "").toUpperCase();
    const walletAddress = String(body.walletAddress || "");

    if (side !== "buy" && side !== "sell") {
      return NextResponse.json({ error: "Invalid side" }, { status: 400 });
    }
    if (!SUPPORTED_SYMBOLS.includes(coin)) {
      return NextResponse.json({ error: `We don't support ${coin || "that coin"} yet.` }, { status: 400 });
    }
    if (!ADDRESS_RE.test(walletAddress)) {
      return NextResponse.json({ error: "Enter a valid wallet address (0x…)." }, { status: 400 });
    }

    // ── BUY ────────────────────────────────────────────────────────────────
    if (side === "buy") {
      const amountNgn = Number(body.amountNgn);
      if (!Number.isFinite(amountNgn) || amountNgn < MIN_ORDER_NGN) {
        return NextResponse.json(
          { error: `Minimum order is ₦${MIN_ORDER_NGN.toLocaleString("en-NG")}.` },
          { status: 400 }
        );
      }
      if (amountNgn > MAX_ORDER_NGN) {
        return NextResponse.json(
          { error: `Maximum order is ₦${MAX_ORDER_NGN.toLocaleString("en-NG")}. Contact support for larger trades.` },
          { status: 400 }
        );
      }

      const quote = await quoteBuy(coin, amountNgn, paymentMethod);

      const order = await createOrder({
        side: "buy",
        paymentMethod,
        coin: quote.coin,
        coinName: quote.coinName,
        amountCrypto: quote.amountCrypto,
        amountNgn: quote.amountNgn,
        exactAmountNgn: quote.exactAmountNgn,
        rate: quote.rate,
        baseRate: quote.baseRate,
        spreadPercent: quote.spreadPercent,
        feeNgn: quote.feeNgn,
        walletAddress,
        quoteTtlMs: QUOTE_TTL_MS,
      });

      return NextResponse.json({
        order,
        merchantBank: MERCHANT_BANK,
        merchantAddress: getMerchantDepositAddress(),
      });
    }

    // ── SELL ───────────────────────────────────────────────────────────────
    const amountCrypto = Number(body.amountCrypto);
    if (!Number.isFinite(amountCrypto) || amountCrypto <= 0) {
      return NextResponse.json({ error: "Enter a valid amount." }, { status: 400 });
    }

    const bank = body.bank as BankDetails | undefined;
    if (!bank?.bankName || !/^\d{10}$/.test(bank.accountNumber || "") || (bank.accountName || "").trim().length < 3) {
      return NextResponse.json(
        { error: "Enter your bank, a 10-digit account number, and the account name." },
        { status: 400 }
      );
    }

    const quote = await quoteSell(coin, amountCrypto);

    if (quote.payoutNgn < MIN_ORDER_NGN) {
      return NextResponse.json(
        { error: `That's below our ₦${MIN_ORDER_NGN.toLocaleString("en-NG")} minimum payout.` },
        { status: 400 }
      );
    }
    if (quote.payoutNgn > MAX_ORDER_NGN) {
      return NextResponse.json(
        { error: `That's above our ₦${MAX_ORDER_NGN.toLocaleString("en-NG")} limit. Contact support.` },
        { status: 400 }
      );
    }

    const order = await createOrder({
      side: "sell",
      paymentMethod: "transfer",
      coin: quote.coin,
      coinName: quote.coinName,
      amountCrypto: quote.amountCrypto,
      amountNgn: quote.payoutNgn,
      exactAmountNgn: quote.payoutNgn,
      rate: quote.rate,
      baseRate: quote.baseRate,
      spreadPercent: quote.spreadPercent,
      feeNgn: quote.feeNgn,
      walletAddress,
      bank: {
        bankName: bank.bankName,
        accountNumber: bank.accountNumber,
        accountName: bank.accountName.trim(),
      },
      quoteTtlMs: QUOTE_TTL_MS,
    });

    return NextResponse.json({
      order,
      merchantBank: MERCHANT_BANK,
      merchantAddress: getMerchantDepositAddress(),
    });
  } catch (err) {
    console.error("Exchange order POST error:", err);
    const message = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// ─── PATCH /api/exchange/orders ─────────────────────────────────────────────
// User-side actions. None of these release funds on their own.
export async function PATCH(request: Request) {
  try {
    const body = await request.json();
    const id = String(body.id || "");
    const action = String(body.action || "");

    if (!id || !action) {
      return NextResponse.json({ error: "Missing id or action" }, { status: 400 });
    }

    const order = await getOrder(id);
    if (!order) return NextResponse.json({ error: "Order not found" }, { status: 404 });

    // ── Buyer says they've sent the bank transfer ───────────────────────────
    if (action === "declare_payment") {
      if (order.side !== "buy" || order.paymentMethod !== "transfer") {
        return NextResponse.json({ error: "Not applicable to this order." }, { status: 400 });
      }
      if (order.status === "expired") {
        return NextResponse.json(
          { error: "This quote expired. Start a new order — if you already sent money, use the support chat and we'll sort it out." },
          { status: 409 }
        );
      }

      const payerName = String(body.payerName || "").trim();
      if (payerName.length < 3) {
        return NextResponse.json(
          { error: "Enter the account name you paid from, so we can match your transfer." },
          { status: 400 }
        );
      }

      const updated = await transitionOrder(id, ["awaiting_payment"], {
        status: "payment_review",
        paidAt: Date.now(),
        payerName,
        payerNote: String(body.payerNote || "").trim().slice(0, 500) || undefined,
      });

      if (!updated) {
        return NextResponse.json({ error: "This order has already moved on." }, { status: 409 });
      }

      await logOrderEvent(id, order.walletAddress, "payment_declared", `Payer: ${payerName}`);
      return NextResponse.json({ order: updated });
    }

    // ── Seller submits the on-chain transfer, and we verify it ourselves ────
    if (action === "submit_tx") {
      if (order.side !== "sell") {
        return NextResponse.json({ error: "Not applicable to this order." }, { status: 400 });
      }
      if (order.status !== "awaiting_payment" && order.status !== "expired") {
        return NextResponse.json({ error: "This order has already been submitted." }, { status: 409 });
      }

      const txHash = String(body.txHash || "").trim();

      const result = await verifyDeposit({
        txHash,
        expectedTo: getMerchantDepositAddress(),
        expectedAmountCrypto: order.amountCrypto,
        expectedFrom: order.walletAddress,
      });

      if (!result.ok) {
        await logOrderEvent(id, order.walletAddress, "verification_failed", result.reason);
        return NextResponse.json({ error: result.reason, retryable: result.retryable }, { status: 400 });
      }

      // Verified on-chain — no admin judgement needed for the crypto leg.
      const updated = await transitionOrder(id, ["awaiting_payment", "expired"], {
        status: "verified",
        paidAt: Date.now(),
        verifiedAt: Date.now(),
        txHash,
      });

      if (!updated) {
        return NextResponse.json({ error: "This order has already moved on." }, { status: 409 });
      }

      await logOrderEvent(
        id,
        order.walletAddress,
        "deposit_verified",
        `${result.valueMon} MON from ${result.from} · ${result.confirmations} confirmation(s)`
      );
      return NextResponse.json({ order: updated });
    }

    // ── User cancels an unpaid order ───────────────────────────────────────
    if (action === "cancel") {
      const updated = await transitionOrder(id, ["awaiting_payment", "expired"], { status: "cancelled" });
      if (!updated) {
        return NextResponse.json(
          { error: "This order can no longer be cancelled — talk to support." },
          { status: 409 }
        );
      }
      await logOrderEvent(id, order.walletAddress, "cancelled", "Cancelled by user");
      return NextResponse.json({ order: updated });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (err) {
    console.error("Exchange order PATCH error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
