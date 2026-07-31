import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { isSupabaseConfigured } from "@/lib/supabase/env";

/**
 * Session refresh and the coarse signed-in check.
 *
 * Named `proxy` rather than `middleware`: this version of Next.js deprecated the
 * middleware convention and renamed it, and the proxy runtime is always Node.
 *
 * Two jobs, and only two:
 *
 *   1. Refresh the Supabase session. Access tokens are short-lived, and a server
 *      component render cannot write cookies, so the refreshed token has nowhere
 *      to go unless something upstream of rendering persists it. That is here.
 *      Without this the app logs users out seemingly at random.
 *
 *   2. Bounce anonymous requests away from pages that need a user, before any
 *      rendering happens.
 *
 * The signed-in check here is deliberately coarse. Row Level Security is the real
 * boundary, and `requireUser()` in the data layer is what actually guards data —
 * this only avoids rendering a page that is certain to be empty. Next's own
 * guidance is the same: treat a proxy check as optimistic, never as the
 * authorization decision.
 */

/** Paths reachable without a session. */
const PUBLIC_PREFIXES = [
  "/login",
  // The OAuth and magic-link handshake, which by definition runs unauthenticated.
  "/auth",
  // Guarded by CRON_SECRET instead; a session would make no sense for a cron job.
  "/api/rates/refresh",
  "/manifest.webmanifest",
];

function isPublic(pathname: string): boolean {
  return PUBLIC_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

export async function proxy(request: NextRequest) {
  // With no Supabase project configured the app runs on demo data, which is what
  // makes `npm run dev` work on a fresh clone. Redirecting to a sign-in page that
  // cannot possibly succeed would break that.
  if (!isSupabaseConfigured()) return NextResponse.next({ request });

  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL as string,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet, headers) {
          // Write to the request too, so anything rendered downstream in this
          // same pass sees the refreshed token rather than the expired one.
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }

          response = NextResponse.next({ request });

          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }

          // The library supplies no-store cache headers alongside any Set-Cookie
          // it asks for. They have to be applied: a cached response carrying a
          // Set-Cookie would hand one user's session to whoever asked next.
          for (const [key, value] of Object.entries(headers)) {
            response.headers.set(key, value);
          }
        },
      },
    },
  );

  // getUser() rather than getSession(): it validates the token with the auth
  // server instead of trusting whatever the cookie claims, and calling it here is
  // what triggers the refresh whose cookies setAll writes back. It must happen
  // before the response is generated, or a refresh completing later is lost.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;

  if (!user && !isPublic(pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    // Remember where they were headed so sign-in can return them there.
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  // Someone already signed in has no use for the sign-in page.
  if (user && pathname === "/login") {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  // Everything except Next's own assets and static files. Without this exclusion
  // the auth redirect would also catch CSS, JS and icons, and the app would load
  // unstyled or not at all.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
