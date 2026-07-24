import { NextResponse } from "next/server";
import { supabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";

// Called by the client right after an on-chain escrow transaction confirms.
// This mirrors on-chain state into Postgres so it can be queried for
// analytics/admin views without re-reading the whole chain every time.
//
// Body: { tradeId, action, actorAddress, txHash, buyerAddress?, sellerAddress?, amountWei?, metadata? }
// action: "created" | "released" | "refund_approved" | "refund_claimed"
export async function POST(request: Request) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ success: true });
  }

  try {
    const body = await request.json();
    const {
      tradeId,
      action,
      actorAddress,
      txHash,
      buyerAddress,
      sellerAddress,
      amountWei,
      metadata,
    } = body as {
      tradeId: string | number;
      action: "created" | "released" | "refund_approved" | "refund_claimed";
      actorAddress: string;
      txHash?: string;
      buyerAddress?: string;
      sellerAddress?: string;
      amountWei?: string;
      metadata?: string;
    };

    if (tradeId === undefined || tradeId === null || !action || !actorAddress) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const id = Number(tradeId);

    if (action === "created") {
      if (!buyerAddress || !sellerAddress || !amountWei) {
        return NextResponse.json({ error: "Missing trade fields for creation" }, { status: 400 });
      }
      await supabaseAdmin.from("escrow_trades").upsert({
        trade_id: id,
        buyer_address: buyerAddress.toLowerCase(),
        seller_address: sellerAddress.toLowerCase(),
        amount_wei: amountWei,
        metadata,
        status: "locked",
        create_tx_hash: txHash,
        updated_at: new Date().toISOString(),
      });
    } else if (action === "released") {
      await supabaseAdmin
        .from("escrow_trades")
        .update({ status: "settled", release_tx_hash: txHash, updated_at: new Date().toISOString() })
        .eq("trade_id", id);
    } else if (action === "refund_approved") {
      await supabaseAdmin
        .from("escrow_trades")
        .update({ status: "refund_ready", refund_approve_tx_hash: txHash, updated_at: new Date().toISOString() })
        .eq("trade_id", id);
    } else if (action === "refund_claimed") {
      await supabaseAdmin
        .from("escrow_trades")
        .update({ status: "settled", refund_claim_tx_hash: txHash, updated_at: new Date().toISOString() })
        .eq("trade_id", id);
    } else {
      return NextResponse.json({ error: "Unknown action" }, { status: 400 });
    }

    await supabaseAdmin.from("trade_activity").insert({
      trade_id: id,
      actor_address: actorAddress.toLowerCase(),
      action,
      tx_hash: txHash,
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Trade log POST error:", err);
    // Tracking must never break the on-chain flow the user just completed.
    return NextResponse.json({ success: true });
  }
}
