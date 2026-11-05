// Relative imports with extensions let Node's test runner load this file.
import type { Task, TaskPriority } from "../domain/task.ts";
import type { Stakeholder, Workspace } from "../domain/workspace.ts";
import { formatMinutes } from "../format.ts";
import {
  calendarDaysFromNow,
  formatDeadline,
  getDeadlineBucket,
  isActive,
  isAwaitingResponse,
} from "../tasks/deadlines.ts";

import {
  assessDeadlineRisk,
  isRecommended,
  rankTasks,
  type ScoredTask,
} from "./engine.ts";

export interface PlanItem {
  id: string;
  title: string;
  priority: TaskPriority;
  workspace: { name: string; color: string } | null;
  stakeholderName: string | null;
  /** Why it's here, shown to the user. */
  reasons: string[];
}

export interface TimeBudget {
  availableMinutes: number;
  /** The total of estimates for what's been recommended. */
  plannedMinutes: number;
  /** Recommended tasks with no estimate, which can't be counted against the time. */
  unestimatedCount: number;
}

export interface DailyPlan {
  /** The three most important tasks. */
  topThree: PlanItem[];
  /** Other tasks that should be finished today. */
  alsoToday: PlanItem[];
  /** Only when time is given: other work that fits in what's left. */
  alsoFits: PlanItem[];
  /** Only when time is given: important work too long for the time available. */
  doesNotFit: PlanItem[];
  followUps: PlanItem[];
  atRisk: PlanItem[];
  time: TimeBudget | null;
}

interface PlanContext {
  workspaces: readonly Pick<Workspace, "id" | "name" | "color">[];
  stakeholders: readonly Pick<Stakeholder, "id" | "name">[];
  now: Date;
  timeZone: string;
  /** Only ever comes from the user. Capacity is never assumed. */
  availableMinutes: number | null;
}

/** Reasons that already state how long a task takes, so it isn't said twice. */
const statesEffort = (reason: string) =>
  reason.startsWith("Quick:") || reason.startsWith("Needs ");

const TOP_COUNT = 3;
const ALSO_FITS_LIMIT = 5;
const STALE_FOLLOW_UP_DAYS = 3;
const MINUTES_IN_A_DAY = 1440;

/** The user's available time from the URL. Anything unusable means not given. */
export function parseAvailableMinutes(
  raw: string | string[] | undefined,
): number | null {
  if (typeof raw !== "string" || !/^\d{1,4}$/.test(raw)) return null;
  const minutes = Number(raw);
  return minutes >= 1 && minutes <= MINUTES_IN_A_DAY ? minutes : null;
}

export function buildPlanHref(
  minutes: number | null,
  workspaceId: string | null,
): string {
  const params = new URLSearchParams();
  if (workspaceId) params.set("workspace", workspaceId);
  if (minutes !== null) params.set("minutes", String(minutes));
  const search = params.toString();
  return search ? `/plan?${search}` : "/plan";
}

export function buildDailyPlan(
  tasks: readonly Task[],
  context: PlanContext,
): DailyPlan {
  const { workspaces, stakeholders, now, timeZone, availableMinutes } = context;

  const toItem = (task: Task, reasons: string[]): PlanItem => {
    const workspace = workspaces.find((item) => item.id === task.workspaceId);
    return {
      id: task.id,
      title: task.title,
      priority: task.priority,
      workspace: workspace
        ? { name: workspace.name, color: workspace.color }
        : null,
      stakeholderName:
        stakeholders.find((item) => item.id === task.stakeholderId)?.name ??
        null,
      reasons,
    };
  };
  const fromScored = ({ task, reasons }: ScoredTask) => toItem(task, reasons);
  const isDueByToday = ({ task }: ScoredTask) => {
    const bucket = getDeadlineBucket(task.deadline, now, timeZone);
    return bucket === "overdue" || bucket === "today";
  };

  const recommended = rankTasks(tasks, now, timeZone).filter(isRecommended);

  let chosen = recommended;
  const tooLong: PlanItem[] = [];
  if (availableMinutes !== null) {
    chosen = [];
    let remaining = availableMinutes;
    for (const scored of recommended) {
      const estimate = scored.task.estimatedMinutes;
      if (estimate === null) {
        // No duration is assumed. It stays in order and is flagged as uncounted.
        chosen.push({
          ...scored,
          reasons: [...scored.reasons, "No estimate, so it isn't counted against your time"],
        });
      } else if (estimate <= remaining) {
        remaining -= estimate;
        chosen.push(
          scored.reasons.some(statesEffort)
            ? scored
            : {
                ...scored,
                reasons: [...scored.reasons, `Takes about ${formatMinutes(estimate)}`],
              },
        );
      } else {
        tooLong.push(
          toItem(scored.task, [
            `Needs ${formatMinutes(estimate)}, and ${remaining === availableMinutes ? "you have" : "you'd have"} ${formatMinutes(remaining)}`,
            ...scored.reasons.filter((reason) => !statesEffort(reason)),
          ]),
        );
      }
    }
  }

  const topThree = chosen.slice(0, TOP_COUNT);
  const rest = chosen.slice(TOP_COUNT);
  const alsoToday = rest.filter(isDueByToday);
  const alsoFits =
    availableMinutes === null
      ? []
      : rest
          .filter((scored) => !isDueByToday(scored))
          .slice(0, ALSO_FITS_LIMIT);

  const shown = [...topThree, ...alsoToday, ...alsoFits];
  // Already in front of the user, so listing them as at risk too would only add noise.
  const alreadyListed = new Set([
    ...shown.map(({ task }) => task.id),
    ...tooLong.map(({ id }) => id),
  ]);

  return {
    topThree: topThree.map(fromScored),
    alsoToday: alsoToday.map(fromScored),
    alsoFits: alsoFits.map(fromScored),
    doesNotFit: tooLong,
    followUps: buildFollowUps(tasks, toItem, now, timeZone),
    atRisk: tasks
      .filter((task) => !alreadyListed.has(task.id))
      .map((task) => ({
        task,
        risk: assessDeadlineRisk(task, now, timeZone),
      }))
      .filter(
        (entry): entry is { task: Task; risk: string } => entry.risk !== null,
      )
      .sort(
        (a, b) =>
          (a.task.deadline?.getTime() ?? 0) - (b.task.deadline?.getTime() ?? 0),
      )
      .map(({ task, risk }) => toItem(task, [risk])),
    time:
      availableMinutes === null
        ? null
        : {
            availableMinutes,
            plannedMinutes: shown.reduce(
              (total, { task }) => total + (task.estimatedMinutes ?? 0),
              0,
            ),
            unestimatedCount: shown.filter(
              ({ task }) => task.estimatedMinutes === null,
            ).length,
          },
  };
}

/** Sooner deadlines first, then whatever has gone quiet for longest. */
function buildFollowUps(
  tasks: readonly Task[],
  toItem: (task: Task, reasons: string[]) => PlanItem,
  now: Date,
  timeZone: string,
): PlanItem[] {
  return tasks
    .filter((task) => isActive(task) && isAwaitingResponse(task))
    .sort(
      (a, b) =>
        (a.deadline?.getTime() ?? Infinity) -
          (b.deadline?.getTime() ?? Infinity) ||
        a.updatedAt.getTime() - b.updatedAt.getTime(),
    )
    .map((task) => {
      const reasons = [
        task.waitingFor ? `Waiting for ${task.waitingFor}` : "Waiting on someone",
      ];
      if (task.deadline) {
        reasons.push(formatDeadline(task.deadline, now, timeZone));
      }
      const quietDays = -calendarDaysFromNow(task.updatedAt, now, timeZone);
      if (quietDays >= STALE_FOLLOW_UP_DAYS) {
        reasons.push(`No change in ${quietDays} days`);
      }
      return toItem(task, reasons);
    });
}
