import { NextResponse } from "next/server";
import { supabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";

// ─── POST /api/push/subscribe ────────────────────────────────────────────────
// Body: { address, subscription: { endpoint, keys: { p256dh, auth } } }
// One row per browser subscription (endpoint is globally unique per browser
// install); re-subscribing the same endpoint just updates which address owns it.
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const address = (body?.address as string | undefined)?.toLowerCase();
    const subscription = body?.subscription;
    const endpoint = subscription?.endpoint as string | undefined;
    const p256dh = subscription?.keys?.p256dh as string | undefined;
    const auth = subscription?.keys?.auth as string | undefined;

    if (!address || !endpoint || !p256dh || !auth) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    if (!isSupabaseConfigured()) {
      return NextResponse.json({ success: false, error: "Persistence not configured" }, { status: 503 });
    }

    const { error } = await supabaseAdmin
      .from("push_subscriptions")
      .upsert({ address, endpoint, p256dh, auth }, { onConflict: "endpoint" });

    if (error) {
      console.error("Push subscribe error:", error.message);
      return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }
}
