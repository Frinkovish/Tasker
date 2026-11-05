import { z } from "zod";

// Relative import with an extension lets Node's test runner load this file.
import { TASK_PRIORITIES } from "../../domain/task.ts";

/**
 * What the model must return. This is only its proposal: sanitizeExtraction
 * decides what's actually offered to the user, so nothing here is trusted.
 */
export const extractionOutputSchema = z.object({
  title: z.string(),
  description: z.string().nullable(),
  workspaceName: z.string().nullable(),
  /** Words from the request that point to this workspace. */
  workspaceEvidence: z.string().nullable(),
  /** The person exactly as the request names them. */
  stakeholderName: z.string().nullable(),
  /** The project exactly as the request names it. */
  projectName: z.string().nullable(),
  /** The exact words in the request that give a deadline. */
  deadlinePhrase: z.string().nullable(),
  deadlineDate: z.string().nullable(),
  deadlineTime: z.string().nullable(),
  priority: z.enum(TASK_PRIORITIES),
  /** The request's words that state urgency, if it states any. */
  priorityEvidence: z.string().nullable(),
  estimatedMinutes: z.number().nullable(),
  /** The request's words that state the effort, if it states any. */
  estimateEvidence: z.string().nullable(),
  nextAction: z.string().nullable(),
  questions: z.array(z.string()),
});
export type ExtractionOutput = z.infer<typeof extractionOutputSchema>;

export const EXTRACTION_SCHEMA_NAME = "task_extraction";

/** Sent to the model, so its reply has this exact structure. */
export const extractionJsonSchema = z.toJSONSchema(extractionOutputSchema, {
  target: "draft-7",
});
