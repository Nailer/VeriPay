import { NextResponse } from "next/server";
import { createIntent, paymentsStatus } from "@/lib/payments";

export const dynamic = "force-dynamic";

// GET /api/pay/intent — is this deployment able to take pay-link payments?
export async function GET() {
  return NextResponse.json(paymentsStatus());
}

// POST /api/pay/intent  { handle, amountNgn, item, buyerAddress, email }
// Opens a card charge for a pay-link payment. The seller's address is looked
// up from the handle here — the browser never supplies where money goes.
export async function POST(request: Request) {
  try {
    const result = await createIntent(await request.json());
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
    return NextResponse.json(result);
  } catch (err) {
    console.error("Pay intent error:", err);
    return NextResponse.json({ error: "Couldn't start the payment." }, { status: 500 });
  }
}
