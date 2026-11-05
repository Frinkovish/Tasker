import { z } from "zod";

export const CAPTURE_MAX_LENGTH = 5000;

/** A request the user has captured but not yet reviewed into a task. */
export const captureSchema = z.object({
  id: z.uuid(),
  sourceText: z.string().min(1),
  createdAt: z.date(),
});
export type Capture = z.infer<typeof captureSchema>;

/**
 * A raw natural-language request. The text is validated after trimming, but
 * only to reject blank input: the user's wording is what gets preserved.
 */
export const captureInputSchema = z.object({
  text: z
    .string()
    .trim()
    .min(1, "Write the request first.")
    .max(
      CAPTURE_MAX_LENGTH,
      `Keep requests under ${CAPTURE_MAX_LENGTH.toLocaleString("en-GB")} characters.`,
    ),
});
export type CaptureInput = z.infer<typeof captureInputSchema>;
