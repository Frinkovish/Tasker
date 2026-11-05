import { z } from "zod";

export const ASSISTANT_MESSAGE_MAX = 2000;
const CONVERSATION_TITLE_MAX = 80;

export const assistantInputSchema = z.object({
  text: z
    .string()
    .trim()
    .min(1, "Write a message first.")
    .max(
      ASSISTANT_MESSAGE_MAX,
      `Keep messages under ${ASSISTANT_MESSAGE_MAX.toLocaleString("en-GB")} characters.`,
    ),
});

/** The first line of the first message, which is how a conversation is recognised. */
export function buildConversationTitle(firstMessage: string): string {
  const text = firstMessage.replace(/\s+/g, " ").trim();
  return text.length > CONVERSATION_TITLE_MAX
    ? `${text.slice(0, CONVERSATION_TITLE_MAX - 1).trimEnd()}…`
    : text;
}

/**
 * The task fields the assistant may propose changing. Not the workspace, the
 * stakeholder, the project or the original request.
 */
export const TASK_CHANGE_FIELDS = [
  "title",
  "deadline",
  "status",
  "priority",
  "estimatedMinutes",
  "nextAction",
  "waitingFor",
] as const;
export type TaskChangeField = (typeof TASK_CHANGE_FIELDS)[number];

/** Values are stored as text: deadlines as ISO moments, estimates as digits. */
export const taskChangeSchema = z.object({
  field: z.enum(TASK_CHANGE_FIELDS),
  before: z.string().nullable(),
  after: z.string().nullable(),
});
export type TaskChange = z.infer<typeof taskChangeSchema>;

export const proposalPayloadSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("update_task"),
    changes: z.array(taskChangeSchema).min(1),
  }),
  z.object({ kind: z.literal("add_note"), body: z.string().min(1) }),
  z.object({ kind: z.literal("add_subtask"), title: z.string().min(1) }),
]);
export type ProposalPayload = z.infer<typeof proposalPayloadSchema>;

export const PROPOSAL_STATUSES = ["pending", "applied", "dismissed"] as const;

export const assistantProposalSchema = z.object({
  id: z.uuid(),
  messageId: z.uuid(),
  taskId: z.uuid(),
  payload: proposalPayloadSchema,
  status: z.enum(PROPOSAL_STATUSES),
  createdAt: z.date(),
  resolvedAt: z.date().nullable(),
});
export type AssistantProposal = z.infer<typeof assistantProposalSchema>;

export const assistantMessageSchema = z.object({
  id: z.uuid(),
  conversationId: z.uuid(),
  role: z.enum(["user", "assistant"]),
  content: z.string().min(1),
  referencedTaskIds: z.array(z.uuid()),
  createdAt: z.date(),
  proposals: z.array(assistantProposalSchema),
});
export type AssistantMessage = z.infer<typeof assistantMessageSchema>;

export const assistantConversationSchema = z.object({
  id: z.uuid(),
  title: z.string().min(1),
  createdAt: z.date(),
  updatedAt: z.date(),
});
export type AssistantConversation = z.infer<typeof assistantConversationSchema>;

/** A proposal that hasn't been saved yet, tied to a task by the code that made it. */
export interface NewProposal {
  taskId: string;
  payload: ProposalPayload;
}

export interface AssistantTurn {
  /** Null starts a new conversation. */
  conversationId: string | null;
  title: string;
  userContent: string;
  assistantContent: string;
  referencedTaskIds: string[];
  proposals: NewProposal[];
}
