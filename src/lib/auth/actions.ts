"use server";

import { z } from "zod";

import { createClient } from "@/lib/supabase/server";

const credentialsSchema = z.object({
  email: z.email(),
  password: z.string().min(1),
});

export interface SignInState {
  error: string | null;
  email: string;
  signedIn: boolean;
}

const INVALID_CREDENTIALS = "That email and password don't match.";

export async function signIn(
  _previous: SignInState,
  formData: FormData,
): Promise<SignInState> {
  const email = String(formData.get("email") ?? "");
  const parsed = credentialsSchema.safeParse({
    email,
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return { error: "Enter your email and password.", email, signedIn: false };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) {
    // One message for both cases, so it doesn't reveal which emails exist.
    if (error.code === "invalid_credentials") {
      return { error: INVALID_CREDENTIALS, email, signedIn: false };
    }
    console.error("Sign-in failed:", error.code, error.message);
    return {
      error: "Couldn't sign in right now. Try again shortly.",
      email,
      signedIn: false,
    };
  }

  return { error: null, email: "", signedIn: true };
}

/*
 * Both actions leave navigation to the browser. Next.js keeps visited pages and
 * their state in the document across client-side navigation, so the caller must
 * do a full page load: otherwise one user's data could remain in the page after
 * signing out, or a typed password after signing in.
 */
export async function signOut(): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.auth.signOut();
  if (error) console.error("Sign-out failed:", error.code, error.message);
}
