// Relative imports with extensions let Node's test runner load this file.
import {
  TASK_PRIORITIES,
  TASK_STATUSES,
  type Task,
  type TaskPriority,
  type TaskStatus,
} from "../domain/task.ts";
import type { Project, Stakeholder } from "../domain/workspace.ts";

import {
  getDeadlineBucket,
  isActive,
  isAwaitingResponse,
  type DeadlineBucket,
} from "./deadlines.ts";

export const DEADLINE_FILTERS = [
  "overdue",
  "today",
  "next7Days",
  "later",
  "none",
] as const satisfies readonly DeadlineBucket[];

export const DEADLINE_FILTER_LABELS: Record<DeadlineBucket, string> = {
  overdue: "Overdue",
  today: "Due today",
  next7Days: "Next 7 days",
  later: "Later",
  none: "No deadline",
};

/** "active" is the default, so finished work doesn't crowd the list. */
export type StatusFilter = "active" | "all" | TaskStatus;

export interface TaskFilters {
  query: string;
  status: StatusFilter;
  priority: TaskPriority | null;
  stakeholderId: string | null;
  projectId: string | null;
  deadline: DeadlineBucket | null;
}

type RawParams = Record<string, string | string[] | undefined>;

const single = (value: string | string[] | undefined) =>
  typeof value === "string" ? value : "";

const oneOf = <Option extends string>(
  value: string,
  options: readonly Option[],
): Option | null =>
  options.includes(value as Option) ? (value as Option) : null;

/**
 * Reads filters from the URL. Anything unknown is ignored, including a
 * stakeholder or project from a workspace that's no longer in scope, which would
 * otherwise leave an empty list with no visible reason.
 */
export function parseTaskFilters(
  params: RawParams,
  known: {
    stakeholderIds: readonly string[];
    projectIds: readonly string[];
  },
): TaskFilters {
  const status = single(params.status);
  return {
    query: single(params.q).trim(),
    status:
      status === "all"
        ? "all"
        : (oneOf(status, TASK_STATUSES) ?? "active"),
    priority: oneOf(single(params.priority), TASK_PRIORITIES),
    stakeholderId: oneOf(single(params.stakeholder), known.stakeholderIds),
    projectId: oneOf(single(params.project), known.projectIds),
    deadline: oneOf(single(params.deadline), DEADLINE_FILTERS),
  };
}

export function hasActiveFilters(filters: TaskFilters): boolean {
  return (
    filters.query !== "" ||
    filters.status !== "active" ||
    filters.priority !== null ||
    filters.stakeholderId !== null ||
    filters.projectId !== null ||
    filters.deadline !== null
  );
}

/** Builds the /tasks URL, leaving defaults out so links stay short. */
export function buildTasksHref(
  filters: Partial<TaskFilters>,
  workspaceId: string | null,
): string {
  const params = new URLSearchParams();
  if (workspaceId) params.set("workspace", workspaceId);
  if (filters.query) params.set("q", filters.query);
  if (filters.status && filters.status !== "active") {
    params.set("status", filters.status);
  }
  if (filters.priority) params.set("priority", filters.priority);
  if (filters.stakeholderId) params.set("stakeholder", filters.stakeholderId);
  if (filters.projectId) params.set("project", filters.projectId);
  if (filters.deadline) params.set("deadline", filters.deadline);

  const search = params.toString();
  return search ? `/tasks?${search}` : "/tasks";
}

interface FilterContext {
  stakeholders: readonly Pick<Stakeholder, "id" | "name">[];
  projects: readonly Pick<Project, "id" | "name">[];
  now: Date;
  timeZone: string;
}

function matchesStatus(task: Task, status: StatusFilter): boolean {
  if (status === "all") return true;
  if (status === "active") return isActive(task);
  // Matches the dashboard's count, including tasks with "waiting for" filled in.
  if (status === "waiting") return isAwaitingResponse(task);
  return task.status === status;
}

/** Every word must appear somewhere, so word order doesn't matter. */
function matchesQuery(
  task: Task,
  query: string,
  { stakeholders, projects }: FilterContext,
): boolean {
  if (!query) return true;

  const haystack = [
    task.title,
    task.description,
    task.sourceRequest,
    task.nextAction,
    task.waitingFor,
    stakeholders.find((item) => item.id === task.stakeholderId)?.name,
    projects.find((item) => item.id === task.projectId)?.name,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return query
    .toLowerCase()
    .split(/\s+/)
    .every((word) => haystack.includes(word));
}

export function filterTasks(
  tasks: readonly Task[],
  filters: TaskFilters,
  context: FilterContext,
): Task[] {
  return tasks.filter(
    (task) =>
      matchesStatus(task, filters.status) &&
      (!filters.priority || task.priority === filters.priority) &&
      (!filters.stakeholderId || task.stakeholderId === filters.stakeholderId) &&
      (!filters.projectId || task.projectId === filters.projectId) &&
      (!filters.deadline ||
        getDeadlineBucket(task.deadline, context.now, context.timeZone) ===
          filters.deadline) &&
      matchesQuery(task, filters.query, context),
  );
}

/**
 * Open work first, soonest deadline first, then by priority. Tasks with no
 * deadline come after dated ones, and finished work goes last, newest first.
 */
export function sortTasks(tasks: readonly Task[]): Task[] {
  return [...tasks].sort((a, b) => {
    const aOpen = isActive(a);
    const bOpen = isActive(b);
    if (aOpen !== bOpen) return aOpen ? -1 : 1;
    if (!aOpen) return b.updatedAt.getTime() - a.updatedAt.getTime();

    return (
      (a.deadline?.getTime() ?? Infinity) -
        (b.deadline?.getTime() ?? Infinity) ||
      TASK_PRIORITIES.indexOf(a.priority) -
        TASK_PRIORITIES.indexOf(b.priority) ||
      b.createdAt.getTime() - a.createdAt.getTime()
    );
  });
}
