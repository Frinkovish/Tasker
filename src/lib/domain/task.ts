import { z } from "zod";

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

export const taskSchema = z.object({
  id: z.uuid(),
  workspaceId: z.uuid(),
  stakeholderId: z.uuid().nullable(),
  projectId: z.uuid().nullable(),
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(5000).nullable(),
  /** The user's original words. Kept verbatim as the task's source text. */
  sourceRequest: z.string().min(1),
  status: taskStatusSchema,
  priority: taskPrioritySchema,
  deadline: z.date().nullable(),
  estimatedMinutes: z.number().int().positive().nullable(),
  nextAction: z.string().trim().max(500).nullable(),
  waitingFor: z.string().trim().max(200).nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
  completedAt: z.date().nullable(),
});
export type Task = z.infer<typeof taskSchema>;
