import type { Task, TaskStatus } from "@/lib/domain/task";

const MS_PER_DAY = 86_400_000;

/**
 * Where a deadline falls relative to now. The buckets don't overlap, and a task
 * with no deadline is "none", never overdue.
 */
export type DeadlineBucket = "overdue" | "today" | "next7Days" | "later" | "none";

const CLOSED_STATUSES: readonly TaskStatus[] = ["done", "cancelled"];

export function isActive(task: Pick<Task, "status">): boolean {
  return !CLOSED_STATUSES.includes(task.status);
}

/** Counts a calendar date in a time zone as a whole number of days. */
function calendarDayNumber(date: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const read = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value);
  return Date.UTC(read("year"), read("month") - 1, read("day")) / MS_PER_DAY;
}

/**
 * Whole calendar days from `now` to `date` in the given zone: 0 is today,
 * 1 is tomorrow and -1 is yesterday. Comparing calendar dates rather than
 * elapsed time keeps this correct across midnight and daylight-saving changes.
 */
export function calendarDaysFromNow(
  date: Date,
  now: Date,
  timeZone: string,
): number {
  return calendarDayNumber(date, timeZone) - calendarDayNumber(now, timeZone);
}

export function getDeadlineBucket(
  deadline: Date | null,
  now: Date,
  timeZone: string,
): DeadlineBucket {
  if (deadline === null) return "none";
  if (deadline.getTime() < now.getTime()) return "overdue";

  const days = calendarDaysFromNow(deadline, now, timeZone);
  if (days === 0) return "today";
  if (days <= 7) return "next7Days";
  return "later";
}

export function formatDeadline(
  deadline: Date,
  now: Date,
  timeZone: string,
): string {
  const days = calendarDaysFromNow(deadline, now, timeZone);

  if (deadline.getTime() < now.getTime()) {
    if (days === 0) return "Overdue today";
    const elapsed = Math.abs(days);
    return `Overdue by ${elapsed} ${elapsed === 1 ? "day" : "days"}`;
  }
  if (days === 0) return "Due today";
  if (days === 1) return "Due tomorrow";

  const label = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    weekday: "short",
    day: "numeric",
    month: "short",
  }).format(deadline);
  return `Due ${label}`;
}
