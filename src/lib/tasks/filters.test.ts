import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { Task } from "../domain/task.ts";

import {
  buildTasksHref,
  filterTasks,
  hasActiveFilters,
  parseTaskFilters,
  sortTasks,
  type TaskFilters,
} from "./filters.ts";
import { toTaskListItems } from "./list-items.ts";

const NOW = new Date("2026-11-04T10:00:00Z");
const UTC = "UTC";
const WORKSPACE_A = "11111111-1111-4111-8111-111111111111";
const NADIA = "aaaaaaaa-0000-4000-8000-000000000001";
const REPORTING = "bbbbbbbb-0000-4000-8000-000000000001";

let nextId = 0;
function task(overrides: Partial<Task>): Task {
  return {
    id: `task-${nextId++}`,
    workspaceId: WORKSPACE_A,
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

const DEFAULTS: TaskFilters = {
  query: "",
  status: "active",
  priority: null,
  stakeholderId: null,
  projectId: null,
  deadline: null,
};
const CONTEXT = {
  stakeholders: [{ id: NADIA, name: "Nadia" }],
  projects: [{ id: REPORTING, name: "Reporting" }],
  now: NOW,
  timeZone: UTC,
};
const titles = (tasks: Task[]) => tasks.map((item) => item.title);
const filter = (tasks: Task[], filters: Partial<TaskFilters>) =>
  titles(filterTasks(tasks, { ...DEFAULTS, ...filters }, CONTEXT));

describe("parseTaskFilters", () => {
  const known = { stakeholderIds: [NADIA], projectIds: [REPORTING] };

  it("defaults to active tasks with nothing else filtered", () => {
    const filters = parseTaskFilters({}, known);
    assert.deepEqual(filters, DEFAULTS);
    assert.equal(hasActiveFilters(filters), false);
  });

  it("reads valid values", () => {
    const filters = parseTaskFilters(
      {
        q: " report ",
        status: "waiting",
        priority: "high",
        stakeholder: NADIA,
        project: REPORTING,
        deadline: "overdue",
      },
      known,
    );
    assert.deepEqual(filters, {
      query: "report",
      status: "waiting",
      priority: "high",
      stakeholderId: NADIA,
      projectId: REPORTING,
      deadline: "overdue",
    });
    assert.equal(hasActiveFilters(filters), true);
  });

  it("ignores unknown values", () => {
    const filters = parseTaskFilters(
      {
        status: "nope",
        priority: "urgent",
        stakeholder: "someone-else",
        project: "other",
        deadline: "soon",
      },
      known,
    );
    assert.deepEqual(filters, DEFAULTS);
  });

  it("ignores repeated parameters", () => {
    assert.equal(parseTaskFilters({ q: ["a", "b"] }, known).query, "");
  });
});

describe("buildTasksHref", () => {
  it("leaves defaults out of the URL", () => {
    assert.equal(buildTasksHref(DEFAULTS, null), "/tasks");
  });

  it("includes the workspace and chosen filters", () => {
    assert.equal(
      buildTasksHref({ deadline: "overdue", status: "all" }, WORKSPACE_A),
      `/tasks?workspace=${WORKSPACE_A}&status=all&deadline=overdue`,
    );
  });

  it("encodes search text", () => {
    assert.equal(buildTasksHref({ query: "a&b c" }, null), "/tasks?q=a%26b+c");
  });
});

describe("filterTasks", () => {
  it("hides finished work by default", () => {
    const tasks = [
      task({ title: "open" }),
      task({ title: "done", status: "done" }),
      task({ title: "cancelled", status: "cancelled" }),
    ];
    assert.deepEqual(filter(tasks, {}), ["open"]);
  });

  it("shows everything with the all filter", () => {
    const tasks = [
      task({ title: "open" }),
      task({ title: "done", status: "done" }),
    ];
    assert.deepEqual(filter(tasks, { status: "all" }), ["open", "done"]);
  });

  it("filters by an exact status, including closed ones", () => {
    const tasks = [
      task({ title: "open" }),
      task({ title: "done", status: "done" }),
    ];
    assert.deepEqual(filter(tasks, { status: "done" }), ["done"]);
  });

  it("includes tasks with waiting for filled in under waiting, but not finished ones", () => {
    const tasks = [
      task({ title: "status", status: "waiting" }),
      task({ title: "field", waitingFor: "Nadia" }),
      task({ title: "done", status: "done", waitingFor: "Nadia" }),
      task({ title: "neither" }),
    ];
    assert.deepEqual(filter(tasks, { status: "waiting" }), ["status", "field"]);
  });

  it("filters by priority, stakeholder and project", () => {
    const tasks = [
      task({ title: "high", priority: "high" }),
      task({ title: "nadia", stakeholderId: NADIA }),
      task({ title: "reporting", projectId: REPORTING }),
    ];
    assert.deepEqual(filter(tasks, { priority: "high" }), ["high"]);
    assert.deepEqual(filter(tasks, { stakeholderId: NADIA }), ["nadia"]);
    assert.deepEqual(filter(tasks, { projectId: REPORTING }), ["reporting"]);
  });

  it("filters by deadline, and no deadline is never overdue", () => {
    const tasks = [
      task({ title: "past", deadline: new Date("2026-11-01T10:00:00Z") }),
      task({ title: "later today", deadline: new Date("2026-11-04T18:00:00Z") }),
      task({ title: "none", deadline: null }),
    ];
    assert.deepEqual(filter(tasks, { deadline: "overdue" }), ["past"]);
    assert.deepEqual(filter(tasks, { deadline: "today" }), ["later today"]);
    assert.deepEqual(filter(tasks, { deadline: "none" }), ["none"]);
  });

  it("searches across fields, ignoring case and word order", () => {
    const tasks = [
      task({ title: "Quarterly report" }),
      task({ title: "other", sourceRequest: "The forecast is due" }),
      task({ title: "from nadia", stakeholderId: NADIA }),
      task({ title: "in project", projectId: REPORTING }),
      task({ title: "unrelated" }),
    ];
    assert.deepEqual(filter(tasks, { query: "REPORT quarterly" }), [
      "Quarterly report",
    ]);
    assert.deepEqual(filter(tasks, { query: "forecast" }), ["other"]);
    assert.deepEqual(filter(tasks, { query: "nadia" }), ["from nadia"]);
    assert.deepEqual(filter(tasks, { query: "reporting" }), ["in project"]);
  });

  it("requires every filter to match", () => {
    const tasks = [
      task({ title: "both", priority: "high", stakeholderId: NADIA }),
      task({ title: "one", priority: "high" }),
    ];
    assert.deepEqual(
      filter(tasks, { priority: "high", stakeholderId: NADIA }),
      ["both"],
    );
  });
});

describe("sortTasks", () => {
  it("puts the soonest deadline first and no deadline after dated tasks", () => {
    const sorted = sortTasks([
      task({ title: "none" }),
      task({ title: "later", deadline: new Date("2026-11-10T10:00:00Z") }),
      task({ title: "soon", deadline: new Date("2026-11-05T10:00:00Z") }),
    ]);
    assert.deepEqual(titles(sorted), ["soon", "later", "none"]);
  });

  it("uses priority when deadlines match", () => {
    const sorted = sortTasks([
      task({ title: "low", priority: "low" }),
      task({ title: "critical", priority: "critical" }),
    ]);
    assert.deepEqual(titles(sorted), ["critical", "low"]);
  });

  it("puts finished work last", () => {
    const sorted = sortTasks([
      task({
        title: "done",
        status: "done",
        deadline: new Date("2026-11-01T10:00:00Z"),
      }),
      task({ title: "open" }),
    ]);
    assert.deepEqual(titles(sorted), ["open", "done"]);
  });

  it("doesn't change the original list", () => {
    const tasks = [task({ title: "b", priority: "low" }), task({ title: "a", priority: "high" })];
    sortTasks(tasks);
    assert.deepEqual(titles(tasks), ["b", "a"]);
  });
});

describe("toTaskListItems", () => {
  const CONTEXT_WITH_WORKSPACE = {
    ...CONTEXT,
    workspaces: [{ id: WORKSPACE_A, name: "GoMyCode", color: "#2563eb" }],
  };
  const PAST = new Date("2026-11-01T10:00:00Z");

  it("marks an open task with a passed deadline as overdue", () => {
    const [item] = toTaskListItems(
      [task({ deadline: PAST })],
      CONTEXT_WITH_WORKSPACE,
    );
    assert.equal(item.isOverdue, true);
    assert.equal(item.deadlineLabel, "Overdue by 3 days");
  });

  it("doesn't call a finished task overdue", () => {
    const [item] = toTaskListItems(
      [task({ deadline: PAST, status: "done" })],
      CONTEXT_WITH_WORKSPACE,
    );
    assert.equal(item.isOverdue, false);
    assert.equal(item.deadlineLabel, null);
    assert.equal(item.isDone, true);
  });

  it("resolves names from ids", () => {
    const [item] = toTaskListItems(
      [task({ stakeholderId: NADIA, projectId: REPORTING })],
      CONTEXT_WITH_WORKSPACE,
    );
    assert.equal(item.stakeholderName, "Nadia");
    assert.equal(item.projectName, "Reporting");
    assert.equal(item.workspace?.name, "GoMyCode");
  });
});
