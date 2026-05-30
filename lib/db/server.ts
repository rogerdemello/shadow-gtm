import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { getEnv } from "../env";
import type { Database } from "./database.types";

// ── Cookie-aware server client ───────────────────────────────────────────────
// For use in Route Handlers, Server Components, and Server Actions. Reads the
// session from request cookies and writes refreshed tokens back. All queries run
// under the signed-in user, so RLS enforces org isolation automatically.
//
// Next 16: cookies() is async. Cookie writes from a Server Component throw, which
// @supabase/ssr tolerates — the middleware (Phase 2) owns token refresh — so we
// swallow the write error here.

export async function getServerClient() {
  const env = getEnv();
  if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    throw new Error(
      "Supabase is not configured: set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY",
    );
  }

  const cookieStore = await cookies();

  return createServerClient<Database>(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (toSet) => {
          try {
            for (const { name, value, options } of toSet) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // Called from a Server Component render — safe to ignore; the
            // middleware refreshes the session on the next request.
          }
        },
      },
    },
  );
}
