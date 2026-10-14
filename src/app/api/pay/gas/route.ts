import { NextResponse } from "next/server";
import { sponsorGas } from "@/lib/payments";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// POST /api/pay/gas  { address }
// Covers the network fee for a buyer or seller about to act on their own
// trade. Eligibility and caps live in sponsorGas().
export async function POST(request: Request) {
  try {
    const { address } = await request.json();
    return NextResponse.json(await sponsorGas(address));
  } catch (err) {
    console.error("Gas sponsor error:", err);
    return NextResponse.json({ ready: false });
  }
}
