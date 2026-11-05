// Relative imports with extensions let Node's test runner load this file.
import {
  assistantConversationSchema,
  assistantMessageSchema,
  assistantProposalSchema,
  type AssistantConversation,
  type AssistantMessage,
  type AssistantProposal,
} from "../domain/assistant.ts";
import { captureSchema, type Capture } from "../domain/capture.ts";
import {
  subtaskSchema,
  taskActivitySchema,
  taskNoteSchema,
  taskSchema,
  type Subtask,
  type Task,
  type TaskActivity,
  type TaskNote,
} from "../domain/task.ts";
import {
  projectSchema,
  stakeholderSchema,
  workspaceSchema,
  type Project,
  type Stakeholder,
  type Workspace,
} from "../domain/workspace.ts";

const DATE_COLUMNS = new Set([
  "created_at",
  "updated_at",
  "completed_at",
  "deadline",
  "resolved_at",
]);

const toCamelCase = (column: string) =>
  column.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase());

/** Converts a database row to the domain's naming, with real Date values. */
function toDomainShape(row: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(row).map(([column, value]) => [
      toCamelCase(column),
      DATE_COLUMNS.has(column) && typeof value === "string"
        ? new Date(value)
        : value,
    ]),
  );
}

/*
 * Each parser validates at the boundary, so a schema that has drifted from the
 * code fails loudly here rather than as bad data somewhere in the UI.
 */
export const parseWorkspace = (row: Record<string, unknown>): Workspace =>
  workspaceSchema.parse(toDomainShape(row));

export const parseStakeholder = (row: Record<string, unknown>): Stakeholder =>
  stakeholderSchema.parse(toDomainShape(row));

export const parseProject = (row: Record<string, unknown>): Project =>
  projectSchema.parse(toDomainShape(row));

export const parseTask = (row: Record<string, unknown>): Task =>
  taskSchema.parse(toDomainShape(row));

export const parseCapture = (row: Record<string, unknown>): Capture =>
  captureSchema.parse(toDomainShape(row));

export const parseSubtask = (row: Record<string, unknown>): Subtask =>
  subtaskSchema.parse(toDomainShape(row));

export const parseTaskNote = (row: Record<string, unknown>): TaskNote =>
  taskNoteSchema.parse(toDomainShape(row));

export const parseTaskActivity = (row: Record<string, unknown>): TaskActivity =>
  taskActivitySchema.parse(toDomainShape(row));

export const parseAssistantConversation = (
  row: Record<string, unknown>,
): AssistantConversation => assistantConversationSchema.parse(toDomainShape(row));

export const parseAssistantProposal = (
  row: Record<string, unknown>,
): AssistantProposal => assistantProposalSchema.parse(toDomainShape(row));

/** The row includes the message's proposals, which arrive nested. */
export const parseAssistantMessage = ({
  assistant_proposals: proposals,
  ...row
}: Record<string, unknown>): AssistantMessage =>
  assistantMessageSchema.parse({
    ...toDomainShape(row),
    proposals: (proposals as Record<string, unknown>[]).map(toDomainShape),
  });
