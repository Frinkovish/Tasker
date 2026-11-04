import type { NextRequest } from "next/server";

import { updateSession } from "@/lib/supabase/proxy";

export function proxy(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  // Everything except build assets, so new routes are protected by default.
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
