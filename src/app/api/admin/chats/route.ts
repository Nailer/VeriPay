import { NextResponse } from "next/server";
import { listThreads, getThread, appendMessage } from "@/lib/chatStore";

// Simple passcode gate for the admin console. Change via ADMIN_PASSCODE env var.
const ADMIN_PASSCODE = process.env.ADMIN_PASSCODE || "lagos-admin";

function unauthorized() {
  return NextResponse.json({ error: "Invalid admin passcode" }, { status: 401 });
}

function isAuthorized(request: Request): boolean {
  return request.headers.get("x-admin-code") === ADMIN_PASSCODE;
}

// ─── GET /api/admin/chats            → list all chat threads ────────────────
// ─── GET /api/admin/chats?thread=id  → full messages for one thread ─────────
export async function GET(request: Request) {
  if (!isAuthorized(request)) return unauthorized();

  const { searchParams } = new URL(request.url);
  const threadId = searchParams.get("thread");

  if (threadId) {
    const messages = await getThread(threadId);
    return NextResponse.json({ messages });
  }
  const threads = await listThreads();
  return NextResponse.json({ threads });
}

// ─── POST /api/admin/chats — send a message as Admin ────────────────────────
// Body: { threadId, text }
export async function POST(request: Request) {
  if (!isAuthorized(request)) return unauthorized();

  try {
    const { threadId, text } = await request.json();
    if (!threadId || !text) {
      return NextResponse.json({ error: "Missing threadId or text" }, { status: 400 });
    }

    const message = await appendMessage(threadId, {
      sender: "Admin",
      address: "admin",
      text,
      isAdmin: true,
    });

    return NextResponse.json({ success: true, message });
  } catch (err) {
    console.error("Admin chat POST error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
