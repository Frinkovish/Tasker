// Relative imports with extensions let Node's test runner load this file.
import type { Task, TaskPriority, TaskStatus } from "../domain/task.ts";
import type { Project, Stakeholder, Workspace } from "../domain/workspace.ts";

import { formatDeadline, getDeadlineBucket, isActive } from "./deadlines.ts";

export interface TaskListItem {
  id: string;
  title: string;
  status: TaskStatus;
  priority: TaskPriority;
  isDone: boolean;
  isClosed: boolean;
  deadlineLabel: string | null;
  isOverdue: boolean;
  workspace: { name: string; color: string } | null;
  stakeholderName: string | null;
  projectName: string | null;
  waitingFor: string | null;
}

interface ListContext {
  workspaces: readonly Pick<Workspace, "id" | "name" | "color">[];
  stakeholders: readonly Pick<Stakeholder, "id" | "name">[];
  projects: readonly Pick<Project, "id" | "name">[];
  now: Date;
  timeZone: string;
}

/** Turns tasks into what a list row shows. */
export function toTaskListItems(
  tasks: readonly Task[],
  { workspaces, stakeholders, projects, now, timeZone }: ListContext,
): TaskListItem[] {
  return tasks.map((task) => {
    const workspace = workspaces.find((item) => item.id === task.workspaceId);
    const isClosed = !isActive(task);

    return {
      id: task.id,
      title: task.title,
      status: task.status,
      priority: task.priority,
      isDone: task.status === "done",
      isClosed,
      // A finished task is no longer due or overdue, whatever its date says.
      deadlineLabel:
        task.deadline && !isClosed
          ? formatDeadline(task.deadline, now, timeZone)
          : null,
      isOverdue:
        !isClosed &&
        getDeadlineBucket(task.deadline, now, timeZone) === "overdue",
      workspace: workspace
        ? { name: workspace.name, color: workspace.color }
        : null,
      stakeholderName:
        stakeholders.find((item) => item.id === task.stakeholderId)?.name ??
        null,
      projectName:
        projects.find((item) => item.id === task.projectId)?.name ?? null,
      waitingFor: task.waitingFor,
    };
  });
}
