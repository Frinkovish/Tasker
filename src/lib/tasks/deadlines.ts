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

/** Open, and can't move until someone else responds. */
export function isAwaitingResponse(
  task: Pick<Task, "status" | "waitingFor">,
): boolean {
  return isActive(task) && (task.status === "waiting" || Boolean(task.waitingFor));
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

/**
 * The exact date, such as "Fri 6 Nov 2026" or "Fri 6 Nov 2026, 14:00", for when the
 * user has to check a specific date rather than get a sense of how close it is.
 */
export function formatDeadlineMoment(deadline: Date, timeZone: string): string {
  const date = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  })
    .format(deadline)
    .replace(",", "");
  const { time } = formatDeadlineInput(deadline, timeZone);
  return time ? `${date}, ${time}` : date;
}

/** How far the zone's clock is ahead of UTC at a given moment, in ms. */
function zoneOffset(utcMs: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(new Date(utcMs));
  const read = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value);
  const asIfUtc = Date.UTC(
    read("year"),
    read("month") - 1,
    read("day"),
    read("hour"),
    read("minute"),
    read("second"),
  );
  return asIfUtc - Math.floor(utcMs / 1000) * 1000;
}

const DATE_INPUT = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME_INPUT = /^([01]\d|2[0-3]):([0-5]\d)$/;

/** A deadline with no time means the end of that day, not its first minute. */
const END_OF_DAY = { hour: 23, minute: 59, second: 59 };

export type DeadlineInputResult =
  | { ok: true; deadline: Date | null }
  | { ok: false; message: string };

/**
 * Turns a date field and an optional time field, read as wall-clock time in the
 * given zone, into an exact moment. Both fields empty means no deadline.
 */
export function parseDeadlineInput(
  dateInput: string,
  timeInput: string,
  timeZone: string,
): DeadlineInputResult {
  const dateText = dateInput.trim();
  const timeText = timeInput.trim();

  if (!dateText) {
    return timeText
      ? { ok: false, message: "Choose a date to go with that time." }
      : { ok: true, deadline: null };
  }

  const date = dateText.match(DATE_INPUT);
  if (!date) return { ok: false, message: "That isn't a valid date." };
  const [year, month, day] = date.slice(1).map(Number);

  // Date.UTC rolls 31 February over into March, which this catches.
  const check = new Date(Date.UTC(year, month - 1, day));
  if (check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day) {
    return { ok: false, message: "That isn't a valid date." };
  }

  let clock = END_OF_DAY;
  if (timeText) {
    const time = timeText.match(TIME_INPUT);
    if (!time) return { ok: false, message: "That isn't a valid time." };
    clock = { hour: Number(time[1]), minute: Number(time[2]), second: 0 };
  }

  // The offset depends on the moment, so check it again in case the first guess
  // landed on the other side of a daylight-saving change.
  const wallClock = Date.UTC(
    year,
    month - 1,
    day,
    clock.hour,
    clock.minute,
    clock.second,
  );
  const firstOffset = zoneOffset(wallClock, timeZone);
  const secondOffset = zoneOffset(wallClock - firstOffset, timeZone);
  return { ok: true, deadline: new Date(wallClock - secondOffset) };
}

/** The reverse of parseDeadlineInput, for filling in an edit form. */
export function formatDeadlineInput(
  deadline: Date | null,
  timeZone: string,
): { date: string; time: string } {
  if (deadline === null) return { date: "", time: "" };

  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(deadline);
  const read = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";

  const time = `${read("hour")}:${read("minute")}`;
  return {
    date: `${read("year")}-${read("month")}-${read("day")}`,
    // End of day is what an empty time field means, so show it that way.
    time: time === "23:59" ? "" : time,
  };
}
