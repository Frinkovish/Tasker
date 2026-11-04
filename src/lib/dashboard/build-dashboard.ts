// Relative imports with extensions let Node's test runner load this file.
import { TASK_PRIORITIES, TASK_PRIORITY_LABELS } from "../domain/task.ts";
import type { Task, TaskPriority, TaskStatus } from "../domain/task.ts";
import type { Stakeholder, Workspace } from "../domain/workspace.ts";
import {
  formatDeadline,
  getDeadlineBucket,
  isActive,
} from "../tasks/deadlines.ts";
import type { DeadlineBucket } from "../tasks/deadlines.ts";

export interface DashboardStats {
  active: number;
  overdue: number;
  dueToday: number;
  dueNext7Days: number;
  waiting: number;
}

export interface WorkspaceRef {
  name: string;
  color: string;
}

export interface PriorityItem {
  id: string;
  title: string;
  priority: TaskPriority;
  /** Why this task was picked, built only from the task's own fields. */
  reason: string;
  workspace: WorkspaceRef | null;
  stakeholderName: string | null;
}

export interface RecentRequest {
  id: string;
  sourceRequest: string;
  createdAt: Date;
  workspace: WorkspaceRef | null;
}

export interface DashboardData {
  stats: DashboardStats;
  priorities: PriorityItem[];
  recentRequests: RecentRequest[];
}

const PRIORITY_LIMIT = 3;
const RECENT_LIMIT = 5;

/** Tasks that can't move until someone else responds aren't recommended. */
const ACTIONABLE_STATUSES: readonly TaskStatus[] = [
  "inbox",
  "todo",
  "in_progress",
];

const isHighPriority = (priority: TaskPriority) =>
  priority === "critical" || priority === "high";

/**
 * Lower ranks come first; null means the task isn't recommended today. Being
 * high priority isn't enough on its own unless the deadline is close or absent,
 * so ordinary requests aren't promoted just for having a stakeholder.
 */
function urgencyRank(
  bucket: DeadlineBucket,
  priority: TaskPriority,
): number | null {
  if (bucket === "overdue") return 0;
  if (bucket === "today") return 1;
  if (!isHighPriority(priority)) return null;
  if (bucket === "next7Days") return 2;
  if (bucket === "none") return 3;
  return null;
}

function explain(task: Task, now: Date, timeZone: string): string {
  const parts: string[] = [];
  if (task.deadline) parts.push(formatDeadline(task.deadline, now, timeZone));
  else parts.push("No deadline");
  parts.push(`${TASK_PRIORITY_LABELS[task.priority]} priority`);
  return parts.join(" · ");
}

/**
 * Turns tasks into what the dashboard shows. The priority ranking is a simple
 * preview; the full engine, including effort and blockers, arrives in Phase 5.
 */
export function buildDashboard(
  tasks: readonly Task[],
  workspaces: readonly Workspace[],
  stakeholders: readonly Stakeholder[],
  now: Date,
  timeZone: string,
): DashboardData {
  const workspaceOf = (id: string): WorkspaceRef | null => {
    const workspace = workspaces.find((item) => item.id === id);
    return workspace ? { name: workspace.name, color: workspace.color } : null;
  };
  const stakeholderNameOf = (id: string | null) =>
    stakeholders.find((item) => item.id === id)?.name ?? null;

  const active = tasks.filter(isActive);
  const bucketOf = (task: Task) =>
    getDeadlineBucket(task.deadline, now, timeZone);
  const countIn = (bucket: DeadlineBucket) =>
    active.filter((task) => bucketOf(task) === bucket).length;

  const priorities = active
    .filter((task) => ACTIONABLE_STATUSES.includes(task.status))
    .flatMap((task) => {
      const rank = urgencyRank(bucketOf(task), task.priority);
      return rank === null ? [] : [{ task, rank }];
    })
    .sort(
      (a, b) =>
        a.rank - b.rank ||
        TASK_PRIORITIES.indexOf(a.task.priority) -
          TASK_PRIORITIES.indexOf(b.task.priority) ||
        (a.task.deadline?.getTime() ?? Infinity) -
          (b.task.deadline?.getTime() ?? Infinity),
    )
    .slice(0, PRIORITY_LIMIT)
    .map(({ task }) => ({
      id: task.id,
      title: task.title,
      priority: task.priority,
      reason: explain(task, now, timeZone),
      workspace: workspaceOf(task.workspaceId),
      stakeholderName: stakeholderNameOf(task.stakeholderId),
    }));

  const recentRequests = [...tasks]
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .slice(0, RECENT_LIMIT)
    .map((task) => ({
      id: task.id,
      sourceRequest: task.sourceRequest,
      createdAt: task.createdAt,
      workspace: workspaceOf(task.workspaceId),
    }));

  return {
    stats: {
      active: active.length,
      overdue: countIn("overdue"),
      dueToday: countIn("today"),
      dueNext7Days: countIn("next7Days"),
      waiting: active.filter((task) => task.status === "waiting").length,
    },
    priorities,
    recentRequests,
  };
}
