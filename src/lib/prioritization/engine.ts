// Relative imports with extensions let Node's test runner load this file.
import { TASK_PRIORITY_LABELS, type Task, type TaskPriority } from "../domain/task.ts";
import { formatMinutes } from "../format.ts";
import {
  calendarDaysFromNow,
  formatDeadline,
  getDeadlineBucket,
  isActive,
  isAwaitingResponse,
} from "../tasks/deadlines.ts";
import { appearsIn } from "../text.ts";

/*
 * The transparent ranking rules. Each task's score is the sum of the points below,
 * and every point it earns comes with a reason shown to the user. Nothing here
 * assumes working hours or capacity, since those aren't known.
 */

const OVERDUE_POINTS = 100;
const OVERDUE_POINTS_PER_DAY = 2;
const OVERDUE_MAX_DAYS = 10;
const DUE_TODAY_POINTS = 80;
const DUE_TOMORROW_POINTS = 60;
const DUE_WITHIN_3_DAYS_POINTS = 45;
const DUE_WITHIN_7_DAYS_POINTS = 30;
const DUE_LATER_POINTS = 5;

const EXPLICIT_URGENCY_POINTS = 50;

const PRIORITY_POINTS: Record<TaskPriority, number> = {
  critical: 60,
  high: 35,
  medium: 15,
  low: 0,
};

const NOT_ENOUGH_TIME_POINTS = 20;
const QUICK_TASK_POINTS = 5;
const QUICK_TASK_MINUTES = 30;

/**
 * Below this, a task isn't worth recommending. Low priority work with no deadline
 * scores nothing, so optional tasks are never presented as important.
 */
const MINIMUM_RECOMMENDED_SCORE = 15;

/** The rules as shown to the user, so what's displayed can't drift from what's used. */
export const RANKING_RULES: readonly { label: string; points: string }[] = [
  {
    label: "Overdue",
    points: `+${OVERDUE_POINTS}, plus ${OVERDUE_POINTS_PER_DAY} per day late, up to ${OVERDUE_MAX_DAYS} days`,
  },
  { label: "Due today", points: `+${DUE_TODAY_POINTS}` },
  { label: "Due tomorrow", points: `+${DUE_TOMORROW_POINTS}` },
  { label: "Due within 3 days", points: `+${DUE_WITHIN_3_DAYS_POINTS}` },
  { label: "Due within 7 days", points: `+${DUE_WITHIN_7_DAYS_POINTS}` },
  { label: "Due later", points: `+${DUE_LATER_POINTS}` },
  { label: "No deadline", points: "+0, and it's never treated as overdue" },
  {
    label: 'Your request says it\'s urgent, such as "urgent" or "ASAP"',
    points: `+${EXPLICIT_URGENCY_POINTS}`,
  },
  { label: "Critical priority", points: `+${PRIORITY_POINTS.critical}` },
  { label: "High priority", points: `+${PRIORITY_POINTS.high}` },
  { label: "Medium priority", points: `+${PRIORITY_POINTS.medium}` },
  { label: "Low priority", points: `+${PRIORITY_POINTS.low}` },
  {
    label: "Needs more time than is left before its deadline",
    points: `+${NOT_ENOUGH_TIME_POINTS}`,
  },
  {
    label: `Takes ${QUICK_TASK_MINUTES} minutes or less`,
    points: `+${QUICK_TASK_POINTS}`,
  },
  {
    label: "Waiting on someone else",
    points: "Not recommended, and listed to follow up instead",
  },
  {
    label: "Having a stakeholder",
    points: "+0, so a request isn't promoted just because someone asked",
  },
];

/** Words in the user's own request that state urgency. */
const URGENCY_PHRASES = [
  "urgent",
  "urgently",
  "urgente",
  "asap",
  "as soon as possible",
  "immediately",
  "right away",
  "top priority",
  "emergency",
  "dès que possible",
  "immédiatement",
  "tout de suite",
  "au plus vite",
];

/** Checked first, so "not urgent" doesn't count as urgent. */
const NOT_URGENT_PHRASES = [
  "not urgent",
  "isn't urgent",
  "non urgent",
  "non-urgent",
  "not very urgent",
  "not really urgent",
  "nothing urgent",
  "no rush",
  "no hurry",
  "pas urgent",
  "pas urgente",
  "rien d'urgent",
  "pas pressé",
];

export function findExplicitUrgency(requestText: string): string | null {
  if (NOT_URGENT_PHRASES.some((phrase) => appearsIn(requestText, phrase))) {
    return null;
  }
  return URGENCY_PHRASES.find((phrase) => appearsIn(requestText, phrase)) ?? null;
}

const MS_PER_MINUTE = 60_000;

function minutesUntilDeadline(task: Task, now: Date): number | null {
  if (task.deadline === null) return null;
  return Math.floor((task.deadline.getTime() - now.getTime()) / MS_PER_MINUTE);
}

export interface ScoreFactor {
  points: number;
  reason: string;
}

export interface ScoredTask {
  task: Task;
  score: number;
  /** Everything that earned points, most important first. */
  reasons: string[];
}

function deadlineFactor(task: Task, now: Date, timeZone: string): ScoreFactor | null {
  if (task.deadline === null) return null;

  const reason = formatDeadline(task.deadline, now, timeZone);
  const bucket = getDeadlineBucket(task.deadline, now, timeZone);
  const days = calendarDaysFromNow(task.deadline, now, timeZone);

  if (bucket === "overdue") {
    const daysLate = Math.min(Math.abs(days), OVERDUE_MAX_DAYS);
    return { points: OVERDUE_POINTS + daysLate * OVERDUE_POINTS_PER_DAY, reason };
  }
  if (days === 0) return { points: DUE_TODAY_POINTS, reason };
  if (days === 1) return { points: DUE_TOMORROW_POINTS, reason };
  if (days <= 3) return { points: DUE_WITHIN_3_DAYS_POINTS, reason };
  if (days <= 7) return { points: DUE_WITHIN_7_DAYS_POINTS, reason };
  return { points: DUE_LATER_POINTS, reason };
}

function effortFactor(task: Task, now: Date): ScoreFactor | null {
  const estimate = task.estimatedMinutes;
  if (estimate === null) return null;

  const minutesLeft = minutesUntilDeadline(task, now);
  if (minutesLeft !== null && minutesLeft > 0 && estimate > minutesLeft) {
    return {
      points: NOT_ENOUGH_TIME_POINTS,
      reason: `Needs ${formatMinutes(estimate)}, and only ${formatMinutes(minutesLeft)} is left`,
    };
  }
  if (estimate <= QUICK_TASK_MINUTES) {
    return {
      points: QUICK_TASK_POINTS,
      reason: `Quick: about ${formatMinutes(estimate)}`,
    };
  }
  return null;
}

export function scoreTask(task: Task, now: Date, timeZone: string): ScoredTask {
  const urgency = findExplicitUrgency(task.sourceRequest);

  const factors: ScoreFactor[] = [
    deadlineFactor(task, now, timeZone),
    urgency
      ? {
          points: EXPLICIT_URGENCY_POINTS,
          reason: `Your request says "${urgency}"`,
        }
      : null,
    {
      points: PRIORITY_POINTS[task.priority],
      reason: `${TASK_PRIORITY_LABELS[task.priority]} priority`,
    },
    effortFactor(task, now),
  ]
    .filter((factor): factor is ScoreFactor => factor !== null)
    // Something worth nothing didn't contribute, so it isn't a reason.
    .filter((factor) => factor.points > 0)
    .sort((a, b) => b.points - a.points);

  return {
    task,
    score: factors.reduce((total, factor) => total + factor.points, 0),
    reasons: factors.map((factor) => factor.reason),
  };
}

/**
 * Open tasks the user can act on now, highest score first. Ties go to the sooner
 * deadline, then to whichever has waited longest.
 */
export function rankTasks(
  tasks: readonly Task[],
  now: Date,
  timeZone: string,
): ScoredTask[] {
  return tasks
    .filter((task) => isActive(task) && !isAwaitingResponse(task))
    .map((task) => scoreTask(task, now, timeZone))
    .sort(
      (a, b) =>
        b.score - a.score ||
        (a.task.deadline?.getTime() ?? Infinity) -
          (b.task.deadline?.getTime() ?? Infinity) ||
        a.task.createdAt.getTime() - b.task.createdAt.getTime() ||
        a.task.id.localeCompare(b.task.id),
    );
}

export const isRecommended = ({ score }: ScoredTask) =>
  score >= MINIMUM_RECOMMENDED_SCORE;

const NOT_STARTED_RISK_DAYS = 2;
const WAITING_RISK_DAYS = 3;

/**
 * Why a task might miss its deadline, or null. This only uses the clock, never
 * assumed working hours. A task that's already overdue has missed its deadline
 * rather than being at risk, so it's handled as a priority instead.
 */
export function assessDeadlineRisk(
  task: Task,
  now: Date,
  timeZone: string,
): string | null {
  if (!isActive(task) || task.deadline === null) return null;
  if (getDeadlineBucket(task.deadline, now, timeZone) === "overdue") return null;

  const days = calendarDaysFromNow(task.deadline, now, timeZone);
  const due = formatDeadline(task.deadline, now, timeZone);

  const minutesLeft = minutesUntilDeadline(task, now);
  if (
    task.estimatedMinutes !== null &&
    minutesLeft !== null &&
    task.estimatedMinutes > minutesLeft
  ) {
    return `Needs ${formatMinutes(task.estimatedMinutes)}, and only ${formatMinutes(minutesLeft)} is left`;
  }
  if (isAwaitingResponse(task) && days <= WAITING_RISK_DAYS) {
    return task.waitingFor
      ? `${due}, and still waiting for ${task.waitingFor}`
      : `${due}, and still waiting on someone`;
  }
  const notStarted = task.status === "inbox" || task.status === "todo";
  if (notStarted && days <= NOT_STARTED_RISK_DAYS) {
    return `${due}, and not started`;
  }
  return null;
}
