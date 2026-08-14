import { NextResponse } from "next/server";
import { supabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";

// ─── POST /api/push/resubscribe ──────────────────────────────────────────────
// Body: { oldEndpoint, subscription: { endpoint, keys: { p256dh, auth } } }
// Fired by the service worker's `pushsubscriptionchange` handler when the
// browser rotates a subscription. Carries the address forward from the old
// row (the SW itself has no way to know it) so alerts don't silently go dark.
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const oldEndpoint = body?.oldEndpoint as string | undefined;
    const subscription = body?.subscription;
    const endpoint = subscription?.endpoint as string | undefined;
    const p256dh = subscription?.keys?.p256dh as string | undefined;
    const auth = subscription?.keys?.auth as string | undefined;

    if (!oldEndpoint || !endpoint || !p256dh || !auth) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    if (!isSupabaseConfigured()) {
      return NextResponse.json({ success: true });
    }

    const { data: existing } = await supabaseAdmin
      .from("push_subscriptions")
      .select("address")
      .eq("endpoint", oldEndpoint)
      .single();

    if (!existing) {
      return NextResponse.json({ success: false, error: "No prior subscription found" }, { status: 404 });
    }

    await supabaseAdmin
      .from("push_subscriptions")
      .upsert({ address: existing.address, endpoint, p256dh, auth }, { onConflict: "endpoint" });

    if (oldEndpoint !== endpoint) {
      await supabaseAdmin.from("push_subscriptions").delete().eq("endpoint", oldEndpoint);
    }

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }
}
