import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  calendarDaysFromNow,
  formatDeadline,
  formatDeadlineInput,
  getDeadlineBucket,
  isActive,
  parseDeadlineInput,
} from "./deadlines.ts";

const TUNIS = "Africa/Tunis"; // UTC+1 all year
const NOW = new Date("2026-11-04T10:00:00Z");

describe("getDeadlineBucket", () => {
  it("never treats a missing deadline as overdue", () => {
    assert.equal(getDeadlineBucket(null, NOW, TUNIS), "none");
  });

  it("treats a deadline earlier today as overdue, not due today", () => {
    const earlier = new Date("2026-11-04T09:00:00Z");
    assert.equal(getDeadlineBucket(earlier, NOW, TUNIS), "overdue");
  });

  it("treats a deadline later today as due today", () => {
    const later = new Date("2026-11-04T17:00:00Z");
    assert.equal(getDeadlineBucket(later, NOW, TUNIS), "today");
  });

  it("includes the seventh day in the next seven days", () => {
    const day7 = new Date("2026-11-11T12:00:00Z");
    const day8 = new Date("2026-11-12T12:00:00Z");
    assert.equal(getDeadlineBucket(day7, NOW, TUNIS), "next7Days");
    assert.equal(getDeadlineBucket(day8, NOW, TUNIS), "later");
  });

  it("uses the configured time zone to decide what today is", () => {
    // 23:30 UTC is already the next day in Tunis, but still today in UTC.
    const lateTonight = new Date("2026-11-04T23:30:00Z");
    assert.equal(getDeadlineBucket(lateTonight, NOW, "UTC"), "today");
    assert.equal(getDeadlineBucket(lateTonight, NOW, TUNIS), "next7Days");
  });
});

describe("calendarDaysFromNow", () => {
  it("counts calendar days across a daylight-saving change", () => {
    // New York moved its clocks back on 2026-11-01, making that day 25 hours.
    const before = new Date("2026-10-31T16:00:00Z");
    const after = new Date("2026-11-01T17:00:00Z");
    assert.equal(calendarDaysFromNow(after, before, "America/New_York"), 1);
  });
});

describe("formatDeadline", () => {
  it("describes past and upcoming deadlines", () => {
    const format = (iso: string) => formatDeadline(new Date(iso), NOW, TUNIS);
    assert.equal(format("2026-11-03T10:00:00Z"), "Overdue by 1 day");
    assert.equal(format("2026-11-01T10:00:00Z"), "Overdue by 3 days");
    assert.equal(format("2026-11-04T09:00:00Z"), "Overdue today");
    assert.equal(format("2026-11-04T17:00:00Z"), "Due today");
    assert.equal(format("2026-11-05T10:00:00Z"), "Due tomorrow");
    assert.equal(format("2026-11-06T10:00:00Z"), "Due Fri 6 Nov");
  });
});

describe("isActive", () => {
  it("excludes only done and cancelled tasks", () => {
    assert.equal(isActive({ status: "inbox" }), true);
    assert.equal(isActive({ status: "waiting" }), true);
    assert.equal(isActive({ status: "done" }), false);
    assert.equal(isActive({ status: "cancelled" }), false);
  });
});

describe("parseDeadlineInput", () => {
  const parse = (date: string, time: string, zone = TUNIS) => {
    const result = parseDeadlineInput(date, time, zone);
    assert.equal(result.ok, true);
    return result.ok ? result.deadline : null;
  };
  const message = (date: string, time: string) => {
    const result = parseDeadlineInput(date, time, TUNIS);
    assert.equal(result.ok, false);
    return result.ok ? "" : result.message;
  };

  it("means no deadline when both fields are empty", () => {
    assert.equal(parse("", "  "), null);
  });

  it("reads the time as wall-clock time in the given zone", () => {
    assert.deepEqual(parse("2026-11-06", "17:00"), new Date("2026-11-06T16:00:00Z"));
    assert.deepEqual(parse("2026-11-06", "17:00", "UTC"), new Date("2026-11-06T17:00:00Z"));
  });

  it("treats a date with no time as the end of that day", () => {
    assert.deepEqual(parse("2026-11-06", ""), new Date("2026-11-06T22:59:59Z"));
  });

  it("isn't overdue during the day it's due, when no time is given", () => {
    const deadline = parse("2026-11-04", "");
    assert.equal(getDeadlineBucket(deadline, NOW, TUNIS), "today");
  });

  it("handles both sides of a daylight-saving change", () => {
    const zone = "America/New_York"; // Clocks went back on 2026-11-01.
    assert.deepEqual(parse("2026-10-31", "12:00", zone), new Date("2026-10-31T16:00:00Z"));
    assert.deepEqual(parse("2026-11-02", "12:00", zone), new Date("2026-11-02T17:00:00Z"));
  });

  it("rejects a time with no date", () => {
    assert.equal(message("", "17:00"), "Choose a date to go with that time.");
  });

  it("rejects dates that don't exist", () => {
    for (const bad of ["2026-02-31", "2026-13-01", "not-a-date", "06/11/2026"]) {
      assert.equal(message(bad, ""), "That isn't a valid date.", bad);
    }
  });

  it("accepts a real leap day", () => {
    assert.deepEqual(parse("2028-02-29", "12:00", "UTC"), new Date("2028-02-29T12:00:00Z"));
  });

  it("rejects times that don't exist", () => {
    for (const bad of ["25:00", "12:60", "noon"]) {
      assert.equal(message("2026-11-06", bad), "That isn't a valid time.", bad);
    }
  });
});

describe("formatDeadlineInput", () => {
  it("is empty for no deadline", () => {
    assert.deepEqual(formatDeadlineInput(null, TUNIS), { date: "", time: "" });
  });

  it("shows the deadline in the given zone", () => {
    assert.deepEqual(
      formatDeadlineInput(new Date("2026-11-06T16:00:00Z"), TUNIS),
      { date: "2026-11-06", time: "17:00" },
    );
  });

  it("shows midnight as 00:00", () => {
    assert.deepEqual(
      formatDeadlineInput(new Date("2026-11-05T23:00:00Z"), TUNIS),
      { date: "2026-11-06", time: "00:00" },
    );
  });

  it("round-trips through parsing, including end of day", () => {
    for (const [date, time] of [["2026-11-06", "17:00"], ["2026-11-06", ""]]) {
      const result = parseDeadlineInput(date, time, TUNIS);
      assert.equal(result.ok, true);
      if (result.ok) {
        assert.deepEqual(formatDeadlineInput(result.deadline, TUNIS), { date, time });
      }
    }
  });
});
