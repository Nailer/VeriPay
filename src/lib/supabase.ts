import { createClient } from "@supabase/supabase-js";

// ─── Server-only Supabase client ────────────────────────────────────────────
// Uses the SERVICE ROLE key, which bypasses Row Level Security entirely.
// This file must only ever be imported from server code (API routes, route
// handlers, server components) — never from a "use client" component, and
// never expose SUPABASE_SERVICE_ROLE_KEY via a NEXT_PUBLIC_ variable.
//
// All tables in the database have RLS enabled with zero policies, so the
// public/anon key cannot read or write anything. Only this service-role
// client (running on the server) can touch the data.

const supabaseUrl =
  process.env.SUPABASE_URL || "https://gwruqdpbugqjrkyfvipa.supabase.co";
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

let warned = false;
export function isSupabaseConfigured(): boolean {
  if (!serviceRoleKey && !warned) {
    warned = true;
    console.warn(
      "[supabase] SUPABASE_SERVICE_ROLE_KEY is not set. Chat, notifications, " +
        "exchange orders, and analytics tracking will not persist until it is configured."
    );
  }
  return Boolean(serviceRoleKey);
}

export const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey || "placeholder-key-not-configured", {
  auth: { persistSession: false },
});
