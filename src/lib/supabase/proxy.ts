import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { getSupabaseEnv, SESSION_COOKIE_OPTIONS } from "./env";

const LOGIN_PATH = "/login";
const HOME_PATH = "/dashboard";

/**
 * Refreshes the session and sends visitors to the right place. This is the
 * first of two checks: getCurrentUser() in the data layer is the one that
 * protects data, and Row Level Security backs both.
 */
export async function updateSession(request: NextRequest) {
  const { url, publishableKey } = getSupabaseEnv();
  let response = NextResponse.next({ request });

  const supabase = createServerClient(url, publishableKey, {
    cookieOptions: SESSION_COOKIE_OPTIONS,
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
        for (const [name, value] of Object.entries(headers)) {
          response.headers.set(name, value);
        }
      },
    },
  });

  const { data } = await supabase.auth.getClaims();
  const isSignedIn = Boolean(data?.claims?.sub);
  const isLoginPage = request.nextUrl.pathname === LOGIN_PATH;

  if (isSignedIn === isLoginPage) {
    const target = request.nextUrl.clone();
    target.pathname = isSignedIn ? HOME_PATH : LOGIN_PATH;
    target.search = "";

    // Keep any refreshed session cookies when redirecting.
    const redirect = NextResponse.redirect(target);
    for (const cookie of response.cookies.getAll()) {
      redirect.cookies.set(cookie);
    }
    return redirect;
  }

  return response;
}
