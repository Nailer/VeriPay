import { NextResponse } from "next/server";
import { listAllOrders } from "@/lib/exchangeStore";

const ADMIN_PASSCODE = process.env.ADMIN_PASSCODE || "lagos-admin";

// ─── GET /api/admin/orders — every exchange order on the platform ───────────
export async function GET(request: Request) {
  if (request.headers.get("x-admin-code") !== ADMIN_PASSCODE) {
    return NextResponse.json({ error: "Invalid admin passcode" }, { status: 401 });
  }
  const orders = await listAllOrders();
  return NextResponse.json({ orders });
}
