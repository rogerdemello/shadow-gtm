import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "./database.types";

// ── Browser client (singleton) ───────────────────────────────────────────────
// For client components — auth UI and Realtime subscriptions (Phase 5). Reads
// the NEXT_PUBLIC_* values, which Next inlines into the client bundle at build,
// so this must use process.env directly (lib/env is server-only).

let _client: ReturnType<typeof createBrowserClient<Database>> | null = null;

export function getBrowserClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    throw new Error(
      "Supabase is not configured: set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY",
    );
  }
  return (_client ??= createBrowserClient<Database>(url, anonKey));
}
