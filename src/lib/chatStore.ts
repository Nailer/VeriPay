// Persistent chat storage backed by Supabase. Used by both the user-facing
// chat API and the admin console, so messages sent from either side show up
// in the same thread.
// Keys: escrow trades use the numeric trade id ("3"), exchange orders use "ex-<orderId>".

import { supabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";

export type ChatMessage = {
  id: number;
  sender: string;
  address: string;
  text: string;
  time: string;
  isAdmin: boolean;
};

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export function getDefaultMessages(threadId: string): ChatMessage[] {
  const isExchange = threadId.startsWith("ex-");
  return [
    {
      id: 1,
      sender: "Admin",
      address: "system",
      text: isExchange
        ? `Welcome to VeriPay Exchange support for Order ${threadId.slice(3).toUpperCase()}. If your payment or crypto is delayed, tell us here and an agent will step in.`
        : `Welcome to the secure resolution channel for Trade #00${threadId}. How can we assist you today?`,
      time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      isAdmin: true,
    },
  ];
}

export async function getThread(threadId: string): Promise<ChatMessage[]> {
  if (!isSupabaseConfigured()) return getDefaultMessages(threadId);

  const { data, error } = await supabaseAdmin
    .from("chat_messages")
    .select("id, sender, address, message, is_admin, created_at")
    .eq("thread_id", threadId)
    .order("created_at", { ascending: true });

  if (error) {
    console.error("getThread error:", error.message);
    return getDefaultMessages(threadId);
  }

  if (!data || data.length === 0) {
    // Seed the welcome message so every thread starts with one.
    const seed = getDefaultMessages(threadId)[0];
    await supabaseAdmin.from("chat_messages").insert({
      thread_id: threadId,
      sender: seed.sender,
      address: seed.address,
      message: seed.text,
      is_admin: seed.isAdmin,
    });
    return getDefaultMessages(threadId);
  }

  return data.map((row) => ({
    id: row.id,
    sender: row.sender,
    address: row.address,
    text: row.message,
    time: formatTime(row.created_at),
    isAdmin: row.is_admin,
  }));
}

export async function appendMessage(
  threadId: string,
  msg: Omit<ChatMessage, "id" | "time">
): Promise<ChatMessage> {
  if (!isSupabaseConfigured()) {
    return { ...msg, id: Date.now(), time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) };
  }

  // Ensure the thread has its welcome message before the first real reply.
  await getThread(threadId);

  const { data, error } = await supabaseAdmin
    .from("chat_messages")
    .insert({
      thread_id: threadId,
      sender: msg.sender,
      address: msg.address,
      message: msg.text,
      is_admin: msg.isAdmin,
    })
    .select("id, sender, address, message, is_admin, created_at")
    .single();

  if (error || !data) {
    console.error("appendMessage error:", error?.message);
    return { ...msg, id: Date.now(), time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) };
  }

  return {
    id: data.id,
    sender: data.sender,
    address: data.address,
    text: data.message,
    time: formatTime(data.created_at),
    isAdmin: data.is_admin,
  };
}

export type ThreadSummary = {
  threadId: string;
  kind: "escrow" | "exchange";
  messageCount: number;
  lastMessage: ChatMessage | null;
  participants: string[];
};

export async function listThreads(): Promise<ThreadSummary[]> {
  if (!isSupabaseConfigured()) return [];

  // Newest-first with a ceiling: this runs on every admin poll, and pulling
  // the entire message history each time gets slower with every message sent.
  // 500 rows is far more than the thread list ever displays.
  const { data, error } = await supabaseAdmin
    .from("chat_messages")
    .select("id, thread_id, sender, address, message, is_admin, created_at")
    .order("created_at", { ascending: false })
    .limit(500);

  if (error || !data) {
    console.error("listThreads error:", error?.message);
    return [];
  }

  // Restore chronological order within each thread.
  data.reverse();

  const byThread = new Map<string, typeof data>();
  for (const row of data) {
    const list = byThread.get(row.thread_id) ?? [];
    list.push(row);
    byThread.set(row.thread_id, list);
  }

  const summaries: ThreadSummary[] = Array.from(byThread.entries()).map(([threadId, rows]) => {
    const participants = Array.from(
      new Set(
        rows
          .filter((r) => r.address && r.address !== "system")
          .map((r) => r.address.toLowerCase())
      )
    );
    const last = rows[rows.length - 1];
    return {
      threadId,
      kind: threadId.startsWith("ex-") ? ("exchange" as const) : ("escrow" as const),
      messageCount: rows.length,
      lastMessage: last
        ? {
            id: last.id,
            sender: last.sender,
            address: last.address,
            text: last.message,
            time: formatTime(last.created_at),
            isAdmin: last.is_admin,
          }
        : null,
      participants,
    };
  });

  return summaries.sort((a, b) => (b.lastMessage?.id ?? 0) - (a.lastMessage?.id ?? 0));
}
