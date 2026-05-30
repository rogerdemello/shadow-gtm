import { createClient } from "@supabase/supabase-js";
import { getEnv } from "../env";
import type { Database } from "./database.types";

// ── Service-role client (server-only, RLS-bypassing) ─────────────────────────
// For the background scan worker (Phase 4) and other trusted server jobs that
// run outside a user session. This key bypasses Row-Level Security, so EVERY
// query made through it MUST be scoped by org_id in application code — there is
// no policy backstop. Never import this into anything that reaches the browser.

let _client: ReturnType<typeof createClient<Database>> | null = null;

export function getServiceClient() {
  const env = getEnv();
  if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error(
      "Service client unavailable: set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY",
    );
  }
  return (_client ??= createClient<Database>(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } },
  ));
}
