// Relative imports with extensions let Node's test runner load this file.
import type { Capture } from "../domain/capture.ts";
import type { Task, TaskPriority } from "../domain/task.ts";
import type { Stakeholder, Workspace } from "../domain/workspace.ts";
import { isRecommended, rankTasks } from "../prioritization/engine.ts";
import {
  getDeadlineBucket,
  isActive,
  isAwaitingResponse,
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
  /** Why this task was picked, from the ranking rules. */
  reason: string;
  workspace: WorkspaceRef | null;
  stakeholderName: string | null;
}

export interface RecentRequest {
  id: string;
  /** Where to go from here: the task, or the review page if it has no task yet. */
  href: string;
  sourceRequest: string;
  createdAt: Date;
  /** Null until the request has been reviewed into a workspace. */
  workspace: WorkspaceRef | null;
}

export interface DashboardData {
  stats: DashboardStats;
  priorities: PriorityItem[];
  recentRequests: RecentRequest[];
}

const PRIORITY_LIMIT = 3;
const RECENT_LIMIT = 5;

/** Turns tasks into what the dashboard shows. */
export function buildDashboard(
  tasks: readonly Task[],
  workspaces: readonly Workspace[],
  stakeholders: readonly Stakeholder[],
  now: Date,
  timeZone: string,
  captures: readonly Capture[] = [],
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

  const priorities = rankTasks(tasks, now, timeZone)
    .filter(isRecommended)
    .slice(0, PRIORITY_LIMIT)
    .map(({ task, reasons }) => ({
      id: task.id,
      title: task.title,
      priority: task.priority,
      reason: reasons.join(" · "),
      workspace: workspaceOf(task.workspaceId),
      stakeholderName: stakeholderNameOf(task.stakeholderId),
    }));

  const recentRequests: RecentRequest[] = [
    ...tasks.map((task) => ({
      id: task.id,
      href: `/tasks/${task.id}`,
      sourceRequest: task.sourceRequest,
      createdAt: task.createdAt,
      workspace: workspaceOf(task.workspaceId),
    })),
    ...captures.map((capture) => ({
      id: capture.id,
      href: `/inbox/${capture.id}`,
      sourceRequest: capture.sourceText,
      createdAt: capture.createdAt,
      workspace: null,
    })),
  ]
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .slice(0, RECENT_LIMIT);

  return {
    stats: {
      active: active.length,
      overdue: countIn("overdue"),
      dueToday: countIn("today"),
      dueNext7Days: countIn("next7Days"),
      waiting: active.filter(isAwaitingResponse).length,
    },
    priorities,
    recentRequests,
  };
}
