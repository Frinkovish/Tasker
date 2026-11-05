import { z } from "zod";

const supabaseEnvSchema = z.object({
  url: z.url(),
  publishableKey: z.string().min(1),
});

/**
 * Only the server ever reads the session, so scripts in the page don't need it, and
 * in production it's only sent over HTTPS.
 */
export const SESSION_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax",
} as const;

/** Public by design: Row Level Security, not this key, protects the data. */
export function getSupabaseEnv() {
  const result = supabaseEnvSchema.safeParse({
    url: process.env.NEXT_PUBLIC_SUPABASE_URL,
    publishableKey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  });
  if (!result.success) {
    throw new Error(
      "Supabase isn't configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY in .env.local.",
    );
  }
  return result.data;
}
