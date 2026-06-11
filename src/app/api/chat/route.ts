import { NextResponse } from "next/server";

// In-memory storage for chats. Key is the trade ID, value is an array of messages.
// This will persist as long as the Next.js process is running.
const chatStorage: Record<string, any[]> = {};

// Default messages for a new trade chat
const getDefaultMessages = (tradeId: string) => [
  {
    id: 1,
    sender: "Admin",
    address: "system",
    text: `Welcome to the secure resolution channel for Trade #00${tradeId}. How can we assist you today?`,
    time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    isAdmin: true,
  }
];

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const tradeId = searchParams.get("tradeId");

  if (!tradeId) {
    return NextResponse.json({ error: "Missing tradeId" }, { status: 400 });
  }

  // Initialize trade chat if it doesn't exist
  if (!chatStorage[tradeId]) {
    chatStorage[tradeId] = getDefaultMessages(tradeId);
  }

  return NextResponse.json({ messages: chatStorage[tradeId] });
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { tradeId, sender, address, text, isAdmin } = body;

    if (!tradeId || !text || !address) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    if (!chatStorage[tradeId]) {
      chatStorage[tradeId] = getDefaultMessages(tradeId);
    }

    const newMessage = {
      id: Date.now(),
      sender: sender || "User",
      address,
      text,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      isAdmin: !!isAdmin,
    };

    chatStorage[tradeId].push(newMessage);

    return NextResponse.json({ success: true, message: newMessage });
  } catch (error) {
    console.error("Chat POST error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
