import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  calendarDaysFromNow,
  formatDeadline,
  getDeadlineBucket,
  isActive,
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
