import { NextResponse } from "next/server";
import { getThread, appendMessage } from "@/lib/chatStore";
import { isSupabaseConfigured } from "@/lib/supabase";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const tradeId = searchParams.get("tradeId");

  if (!tradeId) {
    return NextResponse.json({ error: "Missing tradeId" }, { status: 400 });
  }

  const messages = await getThread(tradeId);
  return NextResponse.json({ messages });
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { tradeId, sender, address, text, isAdmin } = body;

    if (!tradeId || !text || !address) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    // Without storage the message would be accepted, saved nowhere, and vanish
    // on the next poll — which looks like "chat is broken" and is miserable to
    // debug. Fail loudly instead.
    if (!isSupabaseConfigured()) {
      return NextResponse.json(
        { error: "Chat storage is not configured on this server (SUPABASE_SERVICE_ROLE_KEY is missing)." },
        { status: 503 }
      );
    }

    const newMessage = await appendMessage(tradeId, {
      sender: sender || "User",
      address,
      text,
      isAdmin: !!isAdmin,
    });

    return NextResponse.json({ success: true, message: newMessage });
  } catch (error) {
    console.error("Chat POST error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
