import { NextResponse } from "next/server";
import { isSupabaseConfigured } from "@/lib/supabase";
import { buildActivity, toCsv } from "@/lib/activity";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const ADMIN_PASSCODE = process.env.ADMIN_PASSCODE || "lagos-admin";

// GET /api/admin/activity            — totals, operations, 14-day series, feed
// GET /api/admin/activity?format=csv — the whole feed as a CSV file
// Passcode in the x-admin-code header, or ?code= for the CSV download link.
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = request.headers.get("x-admin-code") ?? url.searchParams.get("code");
  if (code !== ADMIN_PASSCODE) return NextResponse.json({ error: "Invalid admin passcode" }, { status: 401 });
  if (!isSupabaseConfigured()) return NextResponse.json({ error: "Persistence not configured" }, { status: 503 });

  try {
    const data = await buildActivity();
    if (url.searchParams.get("format") === "csv") {
      return new NextResponse(toCsv(data.feed), {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="veripay-activity-${data.generatedAt.slice(0, 10)}.csv"`,
        },
      });
    }
    return NextResponse.json(data);
  } catch (err) {
    console.error("Activity error:", err);
    return NextResponse.json({ error: "Couldn't build the activity record." }, { status: 500 });
  }
}
