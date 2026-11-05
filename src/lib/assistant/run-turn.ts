import "server-only";

import { unstable_rethrow } from "next/navigation";

import { isAiConfigured, requestChatStep } from "@/lib/ai/azure-openai";
import { getTimeZone } from "@/lib/config";
import { repository } from "@/lib/data";
import type { AssistantMessage, NewProposal } from "@/lib/domain/assistant";
import { ALL_WORKSPACES } from "@/lib/workspaces/scope";

import {
  REPLY_SCHEMA_NAME,
  replyJsonSchema,
  runConversation,
  type ModelMessage,
} from "./loop";
import {
  ASSISTANT_SYSTEM_PROMPT,
  buildContextMessage,
  buildHistoryMessages,
} from "./prompt";
import { createToolDefinitions, createToolRunner } from "./tools";

/** Several model steps fit comfortably in this, at a couple of seconds each. */
const TURN_TIMEOUT_MS = 90_000;

export type TurnResult =
  | {
      status: "ready";
      reply: string;
      referencedTaskIds: string[];
      proposals: readonly NewProposal[];
    }
  /** AI isn't set up, so this isn't an error. */
  | { status: "unavailable" }
  | { status: "failed" };

/**
 * Gets the assistant's reply to a message. Nothing is saved or changed here. It
 * reads fresh data each time, so a reply can't rest on an earlier one's stale view.
 */
export async function runAssistantTurn(
  text: string,
  history: readonly AssistantMessage[],
): Promise<TurnResult> {
  if (!isAiConfigured()) return { status: "unavailable" };

  try {
    const [workspaces, stakeholders, projects, tasks, captures] = await Promise.all([
      repository.listWorkspaces(),
      repository.listStakeholders(ALL_WORKSPACES),
      repository.listProjects(ALL_WORKSPACES),
      repository.listTasks(ALL_WORKSPACES),
      repository.listCaptures(),
    ]);
    const now = new Date();
    const timeZone = getTimeZone();

    const runner = createToolRunner(
      {
        snapshot: { workspaces, stakeholders, projects, tasks, captures },
        now,
        timeZone,
      },
      async (taskId) => {
        const [subtasks, notes] = await Promise.all([
          repository.listSubtasks(taskId),
          repository.listNotes(taskId),
        ]);
        return { subtasks, notes };
      },
      text,
    );

    const tools = createToolDefinitions(workspaces.map(({ id }) => id));
    const turnSignal = AbortSignal.timeout(TURN_TIMEOUT_MS);
    const messages: ModelMessage[] = [
      { role: "system", content: ASSISTANT_SYSTEM_PROMPT },
      { role: "system", content: buildContextMessage(workspaces, now, timeZone) },
      ...buildHistoryMessages(history, tasks, now, timeZone),
      { role: "user", content: text },
    ];

    const { reply, referenced_task_ids: referenced } = await runConversation(
      messages,
      (transcript, { allowTools }) =>
        requestChatStep({
          messages: transcript,
          tools,
          allowTools,
          schemaName: REPLY_SCHEMA_NAME,
          jsonSchema: replyJsonSchema,
          signal: turnSignal,
        }),
      (name, rawArguments) => runner.run(name, rawArguments),
    );

    const taskIds = new Set(tasks.map(({ id }) => id));
    return {
      status: "ready",
      reply,
      referencedTaskIds: [...new Set(referenced)].filter((id) => taskIds.has(id)),
      proposals: runner.proposals,
    };
  } catch (error) {
    unstable_rethrow(error);
    // Our own messages and timeouts are safe to log. Anything else can quote the
    // model's reply or the user's data, so only its type is logged.
    const name = error instanceof Error ? error.name : "UnknownError";
    const isSafeMessage = name === "Error" || name === "TimeoutError";
    console.error(
      "Assistant reply failed:",
      name,
      isSafeMessage ? (error as Error).message : "",
    );
    return { status: "failed" };
  }
}
