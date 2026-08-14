// Sends real OS-level push notifications (via the browser's Push API) to
// whichever devices a wallet address has subscribed from. This is what makes
// a trade/chat alert show up as a normal device notification even when
// VeriPay isn't open — the in-app bell alone can't do that.

import webpush from "web-push";
import { supabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";

const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
const privateKey = process.env.VAPID_PRIVATE_KEY;
const subject = process.env.VAPID_SUBJECT || "mailto:support@veripay.store";

let configured = false;
function ensureConfigured(): boolean {
  if (configured) return true;
  if (!publicKey || !privateKey) return false;
  webpush.setVapidDetails(subject, publicKey, privateKey);
  configured = true;
  return true;
}

export type PushPayload = {
  title: string;
  body: string;
  url?: string;
};

// Fire-and-forget: push failures must never break the caller's request.
// Expired/invalid subscriptions (410/404) are pruned as they're found.
export async function sendPushToAddress(address: string, payload: PushPayload): Promise<void> {
  if (!ensureConfigured() || !isSupabaseConfigured()) return;

  try {
    const { data, error } = await supabaseAdmin
      .from("push_subscriptions")
      .select("id, endpoint, p256dh, auth")
      .eq("address", address.toLowerCase());

    if (error || !data?.length) return;

    const body = JSON.stringify(payload);
    const staleIds: number[] = [];

    await Promise.all(
      data.map(async (row) => {
        try {
          await webpush.sendNotification(
            { endpoint: row.endpoint, keys: { p256dh: row.p256dh, auth: row.auth } },
            body
          );
        } catch (err) {
          const statusCode = (err as { statusCode?: number })?.statusCode;
          if (statusCode === 404 || statusCode === 410) staleIds.push(row.id);
        }
      })
    );

    if (staleIds.length) {
      await supabaseAdmin.from("push_subscriptions").delete().in("id", staleIds);
    }
  } catch {
    // Push is best-effort — never let it fail the caller.
  }
}
