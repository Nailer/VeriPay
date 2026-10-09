import { NextResponse } from "next/server";
import { confirmIntent, resumeForBuyer } from "@/lib/payments";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// POST /api/pay/confirm  { id, reference }
// The browser says a charge finished; Paystack decides whether that's true.
//
// POST /api/pay/confirm  { buyerAddress, handle }
// A buyer who already paid comes back: find that payment and make sure they
// can finish locking it. Moves no naira — only tops up gas, capped per payment.
export async function POST(request: Request) {
  try {
    const { id, reference, buyerAddress, handle } = await request.json();
    const result = id ? await confirmIntent(id, reference) : await resumeForBuyer(buyerAddress, handle);
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
    return NextResponse.json(result);
  } catch (err) {
    console.error("Pay confirm error:", err);
    return NextResponse.json({ error: "Couldn't confirm the payment." }, { status: 500 });
  }
}
