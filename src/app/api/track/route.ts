import { NextResponse } from "next/server";
import { supabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";

// Lightweight, fire-and-forget tracking endpoint used by the client Analytics
// component. Two event kinds:
//   { kind: "page_view", path, walletAddress?, referrer? }
//   { kind: "wallet_connect", walletAddress, userAgent? }
export async function POST(request: Request) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ success: true });
  }

  try {
    const body = await request.json();
    const { kind } = body as { kind: string };

    if (kind === "page_view") {
      const { path, walletAddress, referrer } = body as {
        path: string;
        walletAddress?: string;
        referrer?: string;
      };
      if (!path) return NextResponse.json({ error: "Missing path" }, { status: 400 });

      await supabaseAdmin.from("page_views").insert({
        path,
        wallet_address: walletAddress ? walletAddress.toLowerCase() : null,
        referrer,
      });
      return NextResponse.json({ success: true });
    }

    if (kind === "wallet_connect") {
      const { walletAddress, userAgent } = body as { walletAddress: string; userAgent?: string };
      if (!walletAddress) return NextResponse.json({ error: "Missing walletAddress" }, { status: 400 });

      const address = walletAddress.toLowerCase();

      await supabaseAdmin.from("wallet_events").insert({
        wallet_address: address,
        event_type: "connect",
        user_agent: userAgent,
      });

      // Upsert the user profile row: bump last_seen_at / connect_count, or create it.
      const { data: existing } = await supabaseAdmin
        .from("app_users")
        .select("wallet_address, connect_count")
        .eq("wallet_address", address)
        .maybeSingle();

      if (existing) {
        await supabaseAdmin
          .from("app_users")
          .update({ last_seen_at: new Date().toISOString(), connect_count: existing.connect_count + 1 })
          .eq("wallet_address", address);
      } else {
        await supabaseAdmin.from("app_users").insert({ wallet_address: address });
      }

      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: "Unknown kind" }, { status: 400 });
  } catch (err) {
    console.error("Track POST error:", err);
    // Tracking must never break the user's experience.
    return NextResponse.json({ success: true });
  }
}
