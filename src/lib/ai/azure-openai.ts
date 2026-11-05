import "server-only";

import { z } from "zod";

import type { ModelMessage, ModelStep } from "@/lib/assistant/loop";
import type { ToolDefinition } from "@/lib/assistant/tools";

const REQUEST_TIMEOUT_MS = 20_000;
const CHAT_STEP_TIMEOUT_MS = 40_000;
const MAX_COMPLETION_TOKENS = 4_000;

const envSchema = z.object({
  endpoint: z.url(),
  apiKey: z.string().min(1),
  deployment: z.string().min(1),
  apiVersion: z.string().min(1),
});

/** Null when AI isn't set up, in which case the app works without it. */
function readConfig() {
  const result = envSchema.safeParse({
    endpoint: process.env.AZURE_OPENAI_ENDPOINT,
    apiKey: process.env.AZURE_OPENAI_API_KEY,
    deployment: process.env.AZURE_OPENAI_DEPLOYMENT,
    apiVersion: process.env.AZURE_OPENAI_API_VERSION,
  });
  return result.success ? result.data : null;
}

export const isAiConfigured = () => readConfig() !== null;

const responseSchema = z.object({
  choices: z
    .array(
      z.object({
        finish_reason: z.string().nullable(),
        message: z.object({
          content: z.string().nullable(),
          refusal: z.string().nullable().optional(),
          tool_calls: z
            .array(
              z.object({
                id: z.string(),
                function: z.object({ name: z.string(), arguments: z.string() }),
              }),
            )
            .nullable()
            .optional(),
        }),
      }),
    )
    .min(1),
});

/**
 * The only code that talks to the AI provider. It never logs request text, replies
 * or the key.
 */
async function postChatCompletion(body: object, signal: AbortSignal) {
  const config = readConfig();
  if (!config) throw new Error("AI isn't configured.");

  const base = config.endpoint.replace(/\/$/, "");
  const deployment = encodeURIComponent(config.deployment);
  const version = encodeURIComponent(config.apiVersion);

  const response = await fetch(
    `${base}/openai/deployments/${deployment}/chat/completions?api-version=${version}`,
    {
      method: "POST",
      headers: { "api-key": config.apiKey, "Content-Type": "application/json" },
      signal,
      body: JSON.stringify({
        ...body,
        max_completion_tokens: MAX_COMPLETION_TOKENS,
      }),
    },
  );
  if (!response.ok) {
    throw new Error(`AI request failed with status ${response.status}.`);
  }

  const { choices } = responseSchema.parse(await response.json());
  return choices[0];
}

const jsonResponseFormat = (name: string, schema: unknown) => ({
  type: "json_schema",
  json_schema: { name, strict: true, schema },
});

interface StructuredRequest<Output> {
  system: string;
  user: string;
  schemaName: string;
  jsonSchema: unknown;
  outputSchema: z.ZodType<Output>;
}

/** Asks the model for one JSON object in a required shape. */
export async function requestStructuredOutput<Output>({
  system,
  user,
  schemaName,
  jsonSchema,
  outputSchema,
}: StructuredRequest<Output>): Promise<Output> {
  const { finish_reason: finishReason, message } = await postChatCompletion(
    {
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      response_format: jsonResponseFormat(schemaName, jsonSchema),
    },
    AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  );
  if (message.refusal || finishReason !== "stop" || !message.content) {
    throw new Error(`AI returned no usable reply (${finishReason}).`);
  }

  return outputSchema.parse(JSON.parse(message.content));
}

const toProviderMessage = (message: ModelMessage) => {
  if (message.role === "tool") {
    return {
      role: "tool",
      tool_call_id: message.toolCallId,
      content: message.content,
    };
  }
  if (message.role === "assistant" && message.toolCalls?.length) {
    return {
      role: "assistant",
      content: message.content,
      tool_calls: message.toolCalls.map(({ id, name, arguments: args }) => ({
        id,
        type: "function",
        function: { name, arguments: args },
      })),
    };
  }
  return { role: message.role, content: message.content };
};

interface ChatStepRequest {
  messages: readonly ModelMessage[];
  tools: readonly ToolDefinition[];
  /** False makes the model answer now rather than ask for another tool. */
  allowTools: boolean;
  schemaName: string;
  jsonSchema: unknown;
  /** Covers the whole turn, on top of the limit for this one step. */
  signal: AbortSignal;
}

/** One step of a conversation in which the model can ask for tools to be run. */
export async function requestChatStep({
  messages,
  tools,
  allowTools,
  schemaName,
  jsonSchema,
  signal,
}: ChatStepRequest): Promise<ModelStep> {
  const { finish_reason: finishReason, message } = await postChatCompletion(
    {
      messages: messages.map(toProviderMessage),
      tools,
      tool_choice: allowTools ? "auto" : "none",
      // This model rejects function tools on this API unless reasoning is off.
      reasoning_effort: "none",
      response_format: jsonResponseFormat(schemaName, jsonSchema),
    },
    AbortSignal.any([signal, AbortSignal.timeout(CHAT_STEP_TIMEOUT_MS)]),
  );

  return {
    content: message.content,
    finishReason,
    refusal: message.refusal ?? null,
    toolCalls: (message.tool_calls ?? []).map(({ id, function: call }) => ({
      id,
      name: call.name,
      arguments: call.arguments,
    })),
  };
}
