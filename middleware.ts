import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

// ── Auth middleware ───────────────────────────────────────────────────────────
// Runs on every request to (a) refresh the Supabase session cookie so SSR auth
// stays valid, and (b) gate the app shell. API routes are NOT redirected — they
// return their own 401 via storeOr401 — only page navigations are bounced to
// /login. When Supabase isn't configured (keyless local demo), it's a no-op.
//
// Reads NEXT_PUBLIC_* directly: middleware runs in the Edge runtime where the
// server-only lib/env (and full process.env) isn't appropriate.

export async function middleware(req: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  let res = NextResponse.next({ request: req });
  if (!url || !anon) return res; // not configured → no gating

  const supabase = createServerClient(url, anon, {
    cookies: {
      getAll: () => req.cookies.getAll(),
      setAll: (toSet) => {
        for (const { name, value } of toSet) req.cookies.set(name, value);
        res = NextResponse.next({ request: req });
        for (const { name, value, options } of toSet) {
          res.cookies.set(name, value, options);
        }
      },
    },
  });

  // Refreshes the session and tells us who (if anyone) is signed in.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = req.nextUrl.pathname;
  const isAuthPage = path === "/login";

  // Unauthenticated → bounce page navigations to /login (APIs self-handle 401).
  if (!user && !isAuthPage && path === "/") {
    const dest = req.nextUrl.clone();
    dest.pathname = "/login";
    return NextResponse.redirect(dest);
  }

  // Already signed in → keep them out of the login page.
  if (user && isAuthPage) {
    const dest = req.nextUrl.clone();
    dest.pathname = "/";
    return NextResponse.redirect(dest);
  }

  return res;
}

export const config = {
  // Run on everything except Next internals and static assets.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
