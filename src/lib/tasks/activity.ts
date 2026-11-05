// Relative imports with extensions let Node's test runner load this file.
import {
  TASK_PRIORITY_LABELS,
  TASK_STATUS_LABELS,
  type TaskActivity,
  type TaskPriority,
  type TaskStatus,
} from "../domain/task.ts";
import type { Project, Stakeholder } from "../domain/workspace.ts";

interface ActivityContext {
  stakeholders: readonly Pick<Stakeholder, "id" | "name">[];
  projects: readonly Pick<Project, "id" | "name">[];
  timeZone: string;
}

const NONE = "none";

const label = <Key extends string>(
  value: unknown,
  labels: Record<Key, string>,
): string => labels[value as Key] ?? String(value ?? NONE);

function deadlineText(value: unknown, timeZone: string): string {
  if (typeof value !== "string") return NONE;
  return new Intl.DateTimeFormat("en-GB", {
    timeZone,
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function nameOf(
  value: unknown,
  items: readonly { id: string; name: string }[],
  removedLabel: string,
): string {
  if (value === null || value === undefined) return NONE;
  return items.find((item) => item.id === value)?.name ?? removedLabel;
}

/** Describes one changed field, in the order fields should be read. */
const FIELD_DESCRIPTIONS: Record<
  string,
  (before: unknown, after: unknown, context: ActivityContext) => string
> = {
  title: (before, after) => `Title changed from "${before}" to "${after}"`,
  status: (before, after) =>
    `Status changed from ${label<TaskStatus>(before, TASK_STATUS_LABELS)} to ${label<TaskStatus>(after, TASK_STATUS_LABELS)}`,
  priority: (before, after) =>
    `Priority changed from ${label<TaskPriority>(before, TASK_PRIORITY_LABELS)} to ${label<TaskPriority>(after, TASK_PRIORITY_LABELS)}`,
  deadline: (before, after, { timeZone }) =>
    `Deadline changed from ${deadlineText(before, timeZone)} to ${deadlineText(after, timeZone)}`,
  stakeholder_id: (before, after, { stakeholders }) =>
    `Stakeholder changed from ${nameOf(before, stakeholders, "a removed stakeholder")} to ${nameOf(after, stakeholders, "a removed stakeholder")}`,
  project_id: (before, after, { projects }) =>
    `Project changed from ${nameOf(before, projects, "a removed project")} to ${nameOf(after, projects, "a removed project")}`,
  estimated_minutes: (before, after) =>
    `Estimate changed from ${before ?? NONE}${before ? " min" : ""} to ${after ?? NONE}${after ? " min" : ""}`,
  waiting_for: (before, after) =>
    `Waiting for changed from ${before ?? NONE} to ${after ?? NONE}`,
  next_action: () => "Next action updated",
  description: () => "Description updated",
};

/** Turns a raw history entry into readable lines, one per changed field. */
export function describeActivity(
  activity: TaskActivity,
  context: ActivityContext,
): string[] {
  if (activity.action === "created") return ["Task created"];

  const before = activity.previousValue ?? {};
  const after = activity.newValue ?? {};

  return Object.keys(FIELD_DESCRIPTIONS)
    .filter((field) => field in after)
    .map((field) =>
      FIELD_DESCRIPTIONS[field](before[field], after[field], context),
    );
}
