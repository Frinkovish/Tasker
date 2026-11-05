import { z } from "zod";

/*
 * The conversation with the model, kept free of any provider or database so it can
 * be tested with scripted replies.
 */

export interface ModelToolCall {
  id: string;
  name: string;
  arguments: string;
}

export type ModelMessage =
  | { role: "system" | "user"; content: string }
  | { role: "assistant"; content: string | null; toolCalls?: ModelToolCall[] }
  | { role: "tool"; toolCallId: string; content: string };

export interface ModelStep {
  content: string | null;
  toolCalls: ModelToolCall[];
  finishReason: string | null;
  refusal: string | null;
}

export interface CompleteOptions {
  /** False forces a written answer, once the model has used all its tool rounds. */
  allowTools: boolean;
}

export type CompleteStep = (
  messages: readonly ModelMessage[],
  options: CompleteOptions,
) => Promise<ModelStep>;

export const REPLY_SCHEMA_NAME = "assistant_reply";

export const assistantReplySchema = z.object({
  /** What the user reads, as plain text. */
  reply: z.string().trim().min(1).max(6000),
  /** Every task the reply talks about, shown as links under it. */
  referenced_task_ids: z.array(z.string()),
});
export type AssistantReply = z.infer<typeof assistantReplySchema>;

export const replyJsonSchema = z.toJSONSchema(assistantReplySchema, {
  target: "draft-7",
});

/** Enough to read, look closer and prepare a change, and low enough to bound cost. */
export const MAX_TOOL_ROUNDS = 5;
const MAX_CALLS_PER_ROUND = 8;

/**
 * Lets the model use tools until it writes its answer. Any unusable reply throws, so
 * a failed turn saves nothing and the user can simply ask again.
 */
export async function runConversation(
  messages: readonly ModelMessage[],
  complete: CompleteStep,
  runTool: (name: string, rawArguments: string) => Promise<string>,
): Promise<AssistantReply> {
  const transcript = [...messages];

  for (let round = 0; ; round++) {
    const step = await complete(transcript, {
      allowTools: round < MAX_TOOL_ROUNDS,
    });

    if (step.toolCalls.length === 0) {
      if (step.refusal || step.finishReason !== "stop" || !step.content) {
        throw new Error(`AI returned no usable reply (${step.finishReason}).`);
      }
      return assistantReplySchema.parse(JSON.parse(step.content));
    }
    if (round >= MAX_TOOL_ROUNDS) {
      throw new Error("AI kept asking for tools after being told to answer.");
    }

    transcript.push({
      role: "assistant",
      content: step.content,
      toolCalls: step.toolCalls,
    });
    // One at a time, so proposals are recorded in the order the model made them.
    for (const [index, call] of step.toolCalls.entries()) {
      transcript.push({
        role: "tool",
        toolCallId: call.id,
        content:
          index < MAX_CALLS_PER_ROUND
            ? await runTool(call.name, call.arguments)
            : JSON.stringify({ error: "Too many calls at once. Ask again for this one." }),
      });
    }
  }
}
