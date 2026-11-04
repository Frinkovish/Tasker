import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { Task } from "../domain/task.ts";

import { buildDashboard } from "./build-dashboard.ts";

const NOW = new Date("2026-11-04T10:00:00Z");
const UTC = "UTC";
const WORKSPACE_ID = "11111111-1111-4111-8111-111111111111";
const WORKSPACE = {
  id: WORKSPACE_ID,
  name: "GoMyCode",
  description: "",
  color: "#2563eb",
  createdAt: NOW,
  updatedAt: NOW,
};

let nextId = 0;
function task(overrides: Partial<Task>): Task {
  return {
    id: String(nextId++),
    workspaceId: WORKSPACE_ID,
    stakeholderId: null,
    projectId: null,
    title: "A task",
    description: null,
    sourceRequest: "A request",
    status: "todo",
    priority: "medium",
    deadline: null,
    estimatedMinutes: null,
    nextAction: null,
    waitingFor: null,
    createdAt: NOW,
    updatedAt: NOW,
    completedAt: null,
    ...overrides,
  };
}

const build = (tasks: Task[]) =>
  buildDashboard(tasks, [WORKSPACE], [], NOW, UTC);

const PAST = new Date("2026-11-02T10:00:00Z");
const LATER_TODAY = new Date("2026-11-04T18:00:00Z");
const IN_THREE_DAYS = new Date("2026-11-07T10:00:00Z");
const NEXT_MONTH = new Date("2026-12-04T10:00:00Z");

describe("dashboard stats", () => {
  it("counts each deadline bucket", () => {
    const { stats } = build([
      task({ deadline: PAST }),
      task({ deadline: LATER_TODAY }),
      task({ deadline: IN_THREE_DAYS }),
      task({ deadline: NEXT_MONTH }),
      task({ deadline: null }),
    ]);
    assert.deepEqual(stats, {
      active: 5,
      overdue: 1,
      dueToday: 1,
      dueNext7Days: 1,
      waiting: 0,
    });
  });

  it("ignores done and cancelled tasks, even with a passed deadline", () => {
    const { stats } = build([
      task({ status: "done", deadline: PAST }),
      task({ status: "cancelled", deadline: PAST }),
    ]);
    assert.equal(stats.active, 0);
    assert.equal(stats.overdue, 0);
  });

  it("still counts a waiting task as overdue when its deadline has passed", () => {
    const { stats } = build([task({ status: "waiting", deadline: PAST })]);
    assert.equal(stats.waiting, 1);
    assert.equal(stats.overdue, 1);
  });
});

describe("today's priorities", () => {
  const titles = (tasks: Task[]) =>
    build(tasks).priorities.map((item) => item.title);

  it("puts overdue work ahead of work due today", () => {
    assert.deepEqual(
      titles([
        task({ title: "today", priority: "critical", deadline: LATER_TODAY }),
        task({ title: "overdue", priority: "low", deadline: PAST }),
      ]),
      ["overdue", "today"],
    );
  });

  it("doesn't recommend waiting tasks", () => {
    assert.deepEqual(
      titles([task({ status: "waiting", deadline: PAST })]),
      [],
    );
  });

  it("doesn't promote medium work that has no close deadline", () => {
    assert.deepEqual(
      titles([
        task({ priority: "medium", deadline: IN_THREE_DAYS }),
        task({ priority: "medium", deadline: null }),
        task({ priority: "high", deadline: NEXT_MONTH }),
      ]),
      [],
    );
  });

  it("recommends at most three tasks", () => {
    const tasks = Array.from({ length: 5 }, () => task({ deadline: PAST }));
    assert.equal(build(tasks).priorities.length, 3);
  });

  it("explains the choice using the task's own fields", () => {
    const [item] = build([
      task({ priority: "critical", deadline: PAST }),
    ]).priorities;
    assert.equal(item.reason, "Overdue by 2 days · Critical priority");
  });
});

describe("recent requests", () => {
  it("lists newest first and keeps the original wording", () => {
    const { recentRequests } = build([
      task({
        sourceRequest: "older",
        createdAt: new Date("2026-11-01T10:00:00Z"),
      }),
      task({
        sourceRequest: "newer",
        createdAt: new Date("2026-11-03T10:00:00Z"),
      }),
    ]);
    assert.deepEqual(
      recentRequests.map((item) => item.sourceRequest),
      ["newer", "older"],
    );
  });
});
