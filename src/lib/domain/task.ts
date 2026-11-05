import { z } from "zod";

// Relative import with an extension lets Node's test runner load this file.
import { parseDeadlineInput } from "../tasks/deadlines.ts";

export const TASK_STATUSES = [
  "inbox",
  "todo",
  "in_progress",
  "waiting",
  "done",
  "cancelled",
] as const;
export const taskStatusSchema = z.enum(TASK_STATUSES);
export type TaskStatus = z.infer<typeof taskStatusSchema>;

export const TASK_STATUS_LABELS: Record<TaskStatus, string> = {
  inbox: "Inbox",
  todo: "To do",
  in_progress: "In progress",
  waiting: "Waiting",
  done: "Done",
  cancelled: "Cancelled",
};

/** Ordered from most to least urgent. */
export const TASK_PRIORITIES = ["critical", "high", "medium", "low"] as const;
export const taskPrioritySchema = z.enum(TASK_PRIORITIES);
export type TaskPriority = z.infer<typeof taskPrioritySchema>;

export const TASK_PRIORITY_LABELS: Record<TaskPriority, string> = {
  critical: "Critical",
  high: "High",
  medium: "Medium",
  low: "Low",
};

const TITLE_MAX = 200;
const DESCRIPTION_MAX = 5000;
const NEXT_ACTION_MAX = 500;
const WAITING_FOR_MAX = 200;
const NOTE_MAX = 5000;

export const taskSchema = z.object({
  id: z.uuid(),
  workspaceId: z.uuid(),
  stakeholderId: z.uuid().nullable(),
  projectId: z.uuid().nullable(),
  title: z.string().trim().min(1).max(TITLE_MAX),
  description: z.string().trim().max(DESCRIPTION_MAX).nullable(),
  /** The user's original words. Kept verbatim as the task's source text. */
  sourceRequest: z.string().min(1),
  status: taskStatusSchema,
  priority: taskPrioritySchema,
  deadline: z.date().nullable(),
  estimatedMinutes: z.number().int().positive().nullable(),
  nextAction: z.string().trim().max(NEXT_ACTION_MAX).nullable(),
  waitingFor: z.string().trim().max(WAITING_FOR_MAX).nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
  completedAt: z.date().nullable(),
});
export type Task = z.infer<typeof taskSchema>;

/** An empty form field means "not provided", which is stored as null. */
const optionalText = (max: number, label: string) =>
  z
    .string()
    .trim()
    .max(max, `Keep ${label} under ${max} characters.`)
    .transform((value) => value || null);

/** Missing as well as empty, because browsers don't submit a disabled select. */
const optionalId = z
  .string()
  .default("")
  .transform((value) => value || null)
  .pipe(z.uuid().nullable());

const estimateSchema = z
  .string()
  .trim()
  .refine((value) => value === "" || /^[1-9]\d{0,5}$/.test(value), {
    error: "Enter the estimate as a whole number of minutes.",
  })
  .transform((value) => (value ? Number(value) : null));

const taskFormFields = {
  title: z
    .string()
    .trim()
    .min(1, "Enter a title.")
    .max(TITLE_MAX, `Keep the title under ${TITLE_MAX} characters.`),
  description: optionalText(DESCRIPTION_MAX, "the description"),
  stakeholderId: optionalId,
  projectId: optionalId,
  status: taskStatusSchema,
  priority: taskPrioritySchema,
  deadlineDate: z.string(),
  deadlineTime: z.string(),
  estimatedMinutes: estimateSchema,
  nextAction: optionalText(NEXT_ACTION_MAX, "the next action"),
  waitingFor: optionalText(WAITING_FOR_MAX, "this field"),
};

/** Replaces the two deadline form fields with one exact moment. */
function withDeadline<Fields extends { deadlineDate: string; deadlineTime: string }>(
  { deadlineDate, deadlineTime, ...fields }: Fields,
  context: z.RefinementCtx,
  timeZone: string,
) {
  const result = parseDeadlineInput(deadlineDate, deadlineTime, timeZone);
  if (!result.ok) {
    context.addIssue({ code: "custom", message: result.message });
    return z.NEVER;
  }
  return { ...fields, deadline: result.deadline };
}

export const createTaskUpdateSchema = (timeZone: string) =>
  z
    .object(taskFormFields)
    .transform((fields, context) => withDeadline(fields, context, timeZone));
export type TaskUpdate = z.output<ReturnType<typeof createTaskUpdateSchema>>;

export const createTaskReviewSchema = (timeZone: string) =>
  z
    .object({
      // Required with no default: the user chooses, and nothing is assumed.
      // First, so it's the message shown when other fields also need attention.
      workspaceId: z.uuid({ error: "Choose a workspace." }),
      ...taskFormFields,
    })
    .transform((fields, context) => withDeadline(fields, context, timeZone));
export type TaskReview = z.output<ReturnType<typeof createTaskReviewSchema>>;

export const SUBTASK_STATUSES = ["todo", "done"] as const;

export const subtaskSchema = z.object({
  id: z.uuid(),
  taskId: z.uuid(),
  title: z.string().trim().min(1).max(TITLE_MAX),
  status: z.enum(SUBTASK_STATUSES),
  createdAt: z.date(),
  completedAt: z.date().nullable(),
});
export type Subtask = z.infer<typeof subtaskSchema>;

export const subtaskInputSchema = z.object({
  title: z
    .string()
    .trim()
    .min(1, "Enter a subtask.")
    .max(TITLE_MAX, `Keep the subtask under ${TITLE_MAX} characters.`),
});

export const taskNoteSchema = z.object({
  id: z.uuid(),
  taskId: z.uuid(),
  body: z.string().trim().min(1).max(NOTE_MAX),
  createdAt: z.date(),
});
export type TaskNote = z.infer<typeof taskNoteSchema>;

export const taskNoteInputSchema = z.object({
  body: z
    .string()
    .trim()
    .min(1, "Write the note first.")
    .max(NOTE_MAX, `Keep the note under ${NOTE_MAX} characters.`),
});

export const taskActivitySchema = z.object({
  id: z.uuid(),
  taskId: z.uuid(),
  action: z.enum(["created", "updated"]),
  previousValue: z.record(z.string(), z.unknown()).nullable(),
  newValue: z.record(z.string(), z.unknown()).nullable(),
  createdAt: z.date(),
});
export type TaskActivity = z.infer<typeof taskActivitySchema>;
