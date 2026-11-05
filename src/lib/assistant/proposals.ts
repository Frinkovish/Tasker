// Relative imports with extensions let Node's test runner load this file.
import type {
  ProposalPayload,
  TaskChange,
  TaskChangeField,
} from "../domain/assistant.ts";
import {
  createTaskUpdateSchema,
  TASK_PRIORITY_LABELS,
  TASK_STATUS_LABELS,
  type Task,
  type TaskPriority,
  type TaskStatus,
} from "../domain/task.ts";
import { formatMinutes } from "../format.ts";
import {
  formatDeadlineInput,
  formatDeadlineMoment,
  parseDeadlineInput,
} from "../tasks/deadlines.ts";

/*
 * Turns what the model asks for into a checked proposal, and a confirmed proposal
 * into the same input the task edit form submits. That way every change passes the
 * validation a person's edit does, and nothing the model wrote reaches the database
 * without being checked.
 */

export interface RequestedChange {
  field: TaskChangeField;
  value: string | null;
}

export type UpdateProposalResult =
  | { ok: true; changes: TaskChange[] }
  | { ok: false; message: string };

const FIELD_LABELS: Record<TaskChangeField, string> = {
  title: "Title",
  deadline: "Deadline",
  status: "Status",
  priority: "Priority",
  estimatedMinutes: "Estimate",
  nextAction: "Next action",
  waitingFor: "Waiting for",
};

function currentValue(task: Task, field: TaskChangeField): string | null {
  switch (field) {
    case "title":
      return task.title;
    case "deadline":
      return task.deadline?.toISOString() ?? null;
    case "status":
      return task.status;
    case "priority":
      return task.priority;
    case "estimatedMinutes":
      return task.estimatedMinutes === null ? null : String(task.estimatedMinutes);
    case "nextAction":
      return task.nextAction;
    case "waitingFor":
      return task.waitingFor;
  }
}

const REQUESTED_DEADLINE = /^(\d{4}-\d{2}-\d{2})(?:[T ](\d{2}:\d{2}))?$/;

/** Puts a requested value in the form it's stored in, or explains why it can't be used. */
function normalizeValue(
  { field, value }: RequestedChange,
  timeZone: string,
): { value: string | null } | { message: string } {
  const text = value?.trim() || null;
  if (field !== "deadline" || text === null) return { value: text };

  const match = text.match(REQUESTED_DEADLINE);
  if (!match) {
    return { message: "A deadline must look like YYYY-MM-DD or YYYY-MM-DD HH:mm." };
  }
  const parsed = parseDeadlineInput(match[1], match[2] ?? "", timeZone);
  return parsed.ok
    ? { value: parsed.deadline?.toISOString() ?? null }
    : { message: parsed.message };
}

/** The task edit form's fields, filled in from the task with these changes applied. */
export function toTaskUpdateInput(
  task: Task,
  changes: readonly TaskChange[],
  timeZone: string,
): Record<string, string> {
  const valueOf = (field: TaskChangeField) => {
    const change = changes.find((item) => item.field === field);
    return change ? change.after : currentValue(task, field);
  };
  const deadline = valueOf("deadline");
  const { date, time } = formatDeadlineInput(
    deadline === null ? null : new Date(deadline),
    timeZone,
  );

  return {
    title: valueOf("title") ?? "",
    description: task.description ?? "",
    stakeholderId: task.stakeholderId ?? "",
    projectId: task.projectId ?? "",
    status: valueOf("status") ?? "",
    priority: valueOf("priority") ?? "",
    deadlineDate: date,
    deadlineTime: time,
    estimatedMinutes: valueOf("estimatedMinutes") ?? "",
    nextAction: valueOf("nextAction") ?? "",
    waitingFor: valueOf("waitingFor") ?? "",
  };
}

export function buildTaskUpdateProposal(
  task: Task,
  requested: readonly RequestedChange[],
  timeZone: string,
): UpdateProposalResult {
  const fields = requested.map(({ field }) => field);
  if (new Set(fields).size !== fields.length) {
    return { ok: false, message: "Each field can only be changed once." };
  }

  const changes: TaskChange[] = [];
  for (const change of requested) {
    const normalized = normalizeValue(change, timeZone);
    if ("message" in normalized) return { ok: false, message: normalized.message };

    const before = currentValue(task, change.field);
    if (normalized.value !== before) {
      changes.push({ field: change.field, before, after: normalized.value });
    }
  }
  if (changes.length === 0) {
    return { ok: false, message: "The task already has those values." };
  }

  const validated = createTaskUpdateSchema(timeZone).safeParse(
    toTaskUpdateInput(task, changes, timeZone),
  );
  return validated.success
    ? { ok: true, changes }
    : { ok: false, message: validated.error.issues[0].message };
}

/**
 * The first field that has moved on since the change was proposed, or null. The
 * proposal was made against the old value, so applying it could overwrite something
 * the user has decided since.
 */
export function findChangedField(
  task: Task,
  changes: readonly TaskChange[],
): string | null {
  const changed = changes.find(
    ({ field, before }) => currentValue(task, field) !== before,
  );
  return changed ? FIELD_LABELS[changed.field] : null;
}

export interface ProposalRow {
  label: string;
  /** Null when there's nothing to compare with, such as a new note. */
  before: string | null;
  after: string;
  /** Something the user should notice before confirming. */
  warning: string | null;
}

function displayValue(
  field: TaskChangeField,
  value: string | null,
  timeZone: string,
): string {
  if (value === null) return "None";
  switch (field) {
    case "deadline":
      return formatDeadlineMoment(new Date(value), timeZone);
    case "status":
      return TASK_STATUS_LABELS[value as TaskStatus] ?? value;
    case "priority":
      return TASK_PRIORITY_LABELS[value as TaskPriority] ?? value;
    case "estimatedMinutes":
      return formatMinutes(Number(value));
    default:
      return value;
  }
}

/** Exactly what will change, written by this code rather than by the model. */
export function describeProposal(
  payload: ProposalPayload,
  now: Date,
  timeZone: string,
): ProposalRow[] {
  switch (payload.kind) {
    case "add_note":
      return [{ label: "Add note", before: null, after: payload.body, warning: null }];
    case "add_subtask":
      return [{ label: "Add subtask", before: null, after: payload.title, warning: null }];
    case "update_task":
      return payload.changes.map(({ field, before, after }) => ({
        label: FIELD_LABELS[field],
        before: displayValue(field, before, timeZone),
        after: displayValue(field, after, timeZone),
        warning:
          field === "deadline" &&
          after !== null &&
          new Date(after).getTime() < now.getTime()
            ? "This date has already passed."
            : null,
      }));
  }
}
