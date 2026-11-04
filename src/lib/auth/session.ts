import "server-only";

import { redirect } from "next/navigation";
import { cache } from "react";

import { createClient } from "@/lib/supabase/server";

export interface CurrentUser {
  id: string;
  email: string;
}

/**
 * Returns the signed-in user, or redirects to the login page. Cached per
 * request, so the shell and the page can both call it cheaply. It verifies the
 * token rather than trusting the cookie's contents.
 */
export const getCurrentUser = cache(async (): Promise<CurrentUser> => {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (!claims?.sub) redirect("/login");

  return { id: claims.sub, email: claims.email ?? "" };
});
