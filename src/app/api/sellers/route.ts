import { NextResponse } from "next/server";
import { getSellerByAddress, getSellerByHandle, registerSeller } from "@/lib/sellers";

export const dynamic = "force-dynamic";

// GET /api/sellers?handle=… | ?address=0x…
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const handle = searchParams.get("handle");
  const address = searchParams.get("address");

  if (handle) return NextResponse.json({ seller: await getSellerByHandle(handle) });
  if (address && /^0x[a-fA-F0-9]{40}$/.test(address)) return NextResponse.json({ seller: await getSellerByAddress(address) });
  return NextResponse.json({ error: "Missing handle or address" }, { status: 400 });
}

// POST /api/sellers  { handle, name, address, signature }
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const result = await registerSeller({
      handle: String(body.handle || ""), name: String(body.name || ""),
      address: String(body.address || ""), signature: String(body.signature || ""),
    });
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
    return NextResponse.json({ seller: result.seller });
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
}
