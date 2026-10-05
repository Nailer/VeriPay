import { NextResponse } from "next/server";
import { confirmIntent } from "@/lib/payments";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// POST /api/pay/confirm  { id, reference }
// The browser says a charge finished; Paystack decides whether that's true.
export async function POST(request: Request) {
  try {
    const { id, reference } = await request.json();
    const result = await confirmIntent(id, reference);
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
    return NextResponse.json(result);
  } catch (err) {
    console.error("Pay confirm error:", err);
    return NextResponse.json({ error: "Couldn't confirm the payment." }, { status: 500 });
  }
}
