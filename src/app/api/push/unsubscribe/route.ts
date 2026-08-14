import { NextResponse } from "next/server";
import { supabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";

// ─── POST /api/push/unsubscribe ──────────────────────────────────────────────
// Body: { endpoint }
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const endpoint = body?.endpoint as string | undefined;

    if (!endpoint) {
      return NextResponse.json({ error: "Missing endpoint" }, { status: 400 });
    }

    if (!isSupabaseConfigured()) {
      return NextResponse.json({ success: true });
    }

    await supabaseAdmin.from("push_subscriptions").delete().eq("endpoint", endpoint);
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }
}
