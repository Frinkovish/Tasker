import "server-only";

import { unstable_rethrow } from "next/navigation";

import { isAiConfigured, requestStructuredOutput } from "@/lib/ai/azure-openai";
import { getTimeZone } from "@/lib/config";
import { repository } from "@/lib/data";
import { ALL_WORKSPACES } from "@/lib/workspaces/scope";

import {
  buildExtractionUserMessage,
  EXTRACTION_SYSTEM_PROMPT,
} from "./prompt";
import { sanitizeExtraction, type Extraction } from "./sanitize";
import {
  EXTRACTION_SCHEMA_NAME,
  extractionJsonSchema,
  extractionOutputSchema,
} from "./schema";

export type ExtractionResult =
  | { status: "ready"; extraction: Extraction }
  /** AI isn't set up, so this isn't an error. */
  | { status: "unavailable" }
  /** It failed this time. The form still works without it. */
  | { status: "failed" };

/**
 * Proposes task details for a request. It never throws for an AI problem, because
 * the user must always be able to review a request by hand.
 */
export async function extractTaskDetails(
  requestText: string,
): Promise<ExtractionResult> {
  if (!isAiConfigured()) return { status: "unavailable" };

  try {
    const [workspaces, stakeholders, projects] = await Promise.all([
      repository.listWorkspaces(),
      repository.listStakeholders(ALL_WORKSPACES),
      repository.listProjects(ALL_WORKSPACES),
    ]);
    const now = new Date();
    const timeZone = getTimeZone();
    const workspaceName = (id: string) =>
      workspaces.find((workspace) => workspace.id === id)?.name ?? "";

    const output = await requestStructuredOutput({
      system: EXTRACTION_SYSTEM_PROMPT,
      user: buildExtractionUserMessage(requestText, {
        workspaces: workspaces.map(({ name }) => ({ name })),
        stakeholders: stakeholders.map(({ name, role, workspaceId }) => ({
          name,
          role,
          workspaceName: workspaceName(workspaceId),
        })),
        projects: projects.map(({ name, workspaceId }) => ({
          name,
          workspaceName: workspaceName(workspaceId),
        })),
        now,
        timeZone,
      }),
      schemaName: EXTRACTION_SCHEMA_NAME,
      jsonSchema: extractionJsonSchema,
      outputSchema: extractionOutputSchema,
    });

    return {
      status: "ready",
      extraction: sanitizeExtraction(output, {
        requestText,
        workspaces,
        stakeholders,
        projects,
        now,
        timeZone,
      }),
    };
  } catch (error) {
    unstable_rethrow(error);
    // Our own messages and timeouts are safe to log. Parsing errors can quote the
    // model's reply, which can quote the request, so only their type is logged.
    const name = error instanceof Error ? error.name : "UnknownError";
    const isSafeMessage = name === "Error" || name === "TimeoutError";
    console.error(
      "Task extraction failed:",
      name,
      isSafeMessage ? (error as Error).message : "",
    );
    return { status: "failed" };
  }
}
