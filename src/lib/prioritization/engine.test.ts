import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { Task } from "../domain/task.ts";

import {
  RANKING_RULES,
  assessDeadlineRisk,
  findExplicitUrgency,
  isRecommended,
  rankTasks,
  scoreTask,
} from "./engine.ts";
import {
  buildDailyPlan,
  buildPlanHref,
  parseAvailableMinutes,
} from "./plan.ts";

// Wednesday 4 November 2026, 10:00 in Tunis.
const NOW = new Date("2026-11-04T09:00:00Z");
const ZONE = "Africa/Tunis";
const WS_A = "11111111-1111-4111-8111-111111111111";
const WS_B = "22222222-2222-4222-8222-222222222222";
const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const inDays = (days: number) => new Date(NOW.getTime() + days * DAY);
const inHours = (hours: number) => new Date(NOW.getTime() + hours * HOUR);

let nextId = 0;
function task(overrides: Partial<Task>): Task {
  nextId += 1;
  return {
    id: `t-${String(nextId).padStart(4, "0")}`,
    workspaceId: WS_A,
    stakeholderId: null,
    projectId: null,
    title: `Task ${nextId}`,
    description: null,
    sourceRequest: "A request",
    status: "todo",
    priority: "medium",
    deadline: null,
    estimatedMinutes: null,
    nextAction: null,
    waitingFor: null,
    createdAt: inDays(-1),
    updatedAt: inDays(-1),
    completedAt: null,
    ...overrides,
  };
}

const score = (overrides: Partial<Task>) => scoreTask(task(overrides), NOW, ZONE);
const titles = (tasks: Task[]) =>
  rankTasks(tasks, NOW, ZONE).map(({ task: item }) => item.title);

describe("findExplicitUrgency", () => {
  it("finds urgency in the user's own words, in English and French", () => {
    assert.equal(findExplicitUrgency("This is URGENT, please"), "urgent");
    assert.equal(findExplicitUrgency("Send it asap"), "asap");
    assert.equal(findExplicitUrgency("Envoie ça dès que possible"), "dès que possible");
  });

  it("doesn't count a negated mention", () => {
    for (const text of ["This is not urgent", "No rush on this", "Ce n'est pas urgent"]) {
      assert.equal(findExplicitUrgency(text), null, text);
    }
  });

  it("doesn't match inside other words or ordinary requests", () => {
    assert.equal(findExplicitUrgency("The insurgent report"), null);
    assert.equal(findExplicitUrgency("Please update the dashboard"), null);
  });
});

describe("scoring", () => {
  it("never treats a missing deadline as overdue", () => {
    const { reasons } = score({ deadline: null, priority: "medium" });
    assert.deepEqual(reasons, ["Medium priority"]);
  });

  it("gives closer deadlines more points", () => {
    const points = [
      score({ deadline: inDays(-2) }),
      score({ deadline: inHours(3) }),
      score({ deadline: inDays(1) }),
      score({ deadline: inDays(3) }),
      score({ deadline: inDays(6) }),
      score({ deadline: inDays(30) }),
      score({ deadline: null }),
    ].map((scored) => scored.score);
    assert.deepEqual(points, [...points].sort((a, b) => b - a));
    assert.equal(new Set(points).size, points.length);
  });

  it("gives longer-overdue tasks more points, up to a limit", () => {
    assert.ok(score({ deadline: inDays(-5) }).score > score({ deadline: inDays(-1) }).score);
    assert.equal(score({ deadline: inDays(-40) }).score, score({ deadline: inDays(-20) }).score);
  });

  it("adds points for explicit urgency and explains it", () => {
    const urgent = score({ sourceRequest: "Urgent: fix this" });
    assert.equal(urgent.score, score({}).score + 50);
    assert.ok(urgent.reasons.includes('Your request says "urgent"'));
  });

  it("gives no points just for having a stakeholder", () => {
    assert.equal(score({ stakeholderId: "s-1" }).score, score({}).score);
  });

  it("flags work that needs more time than is left", () => {
    const { reasons } = score({ deadline: inHours(1), estimatedMinutes: 180 });
    assert.ok(reasons.includes("Needs 3h, and only 1h is left"), reasons.join());
  });

  it("gives a small boost to quick tasks, but no penalty for long ones", () => {
    assert.equal(score({ estimatedMinutes: 15 }).score, score({}).score + 5);
    assert.ok(score({ estimatedMinutes: 15 }).reasons.includes("Quick: about 15m"));
    assert.equal(score({ estimatedMinutes: 300 }).score, score({}).score);
  });

  it("gives no effort points without an estimate", () => {
    assert.equal(score({ estimatedMinutes: null }).reasons.length, 1);
  });

  it("lists reasons with the most important first", () => {
    const { reasons } = score({
      deadline: inDays(-2),
      priority: "critical",
      sourceRequest: "urgent",
    });
    assert.deepEqual(reasons, [
      "Overdue by 2 days",
      "Critical priority",
      'Your request says "urgent"',
    ]);
  });

  it("doesn't list something that earned nothing as a reason", () => {
    const { reasons, score: points } = score({ priority: "low" });
    assert.deepEqual(reasons, []);
    assert.equal(points, 0);
  });
});

describe("ranking", () => {
  it("excludes finished tasks", () => {
    assert.deepEqual(
      titles([
        task({ title: "done", status: "done", deadline: inDays(-1) }),
        task({ title: "cancelled", status: "cancelled", deadline: inDays(-1) }),
        task({ title: "open" }),
      ]),
      ["open"],
    );
  });

  it("excludes tasks waiting on someone, by status or by the field", () => {
    assert.deepEqual(
      titles([
        task({ title: "status", status: "waiting", deadline: inDays(-1) }),
        task({ title: "field", waitingFor: "Nadia", deadline: inDays(-1) }),
        task({ title: "open" }),
      ]),
      ["open"],
    );
  });

  it("ranks an overdue task above an equal one due today", () => {
    assert.deepEqual(
      titles([
        task({ title: "today", deadline: inHours(3) }),
        task({ title: "overdue", deadline: inDays(-1) }),
      ]),
      ["overdue", "today"],
    );
  });

  it("lets a critical task due today beat a low priority overdue one", () => {
    assert.deepEqual(
      titles([
        task({ title: "low overdue", priority: "low", deadline: inDays(-1) }),
        task({ title: "critical today", priority: "critical", deadline: inHours(3) }),
      ]),
      ["critical today", "low overdue"],
    );
  });

  it("breaks ties by the sooner deadline, then the oldest", () => {
    assert.deepEqual(
      titles([
        task({ title: "newer", createdAt: inDays(-1) }),
        task({ title: "older", createdAt: inDays(-5) }),
      ]),
      ["older", "newer"],
    );
    assert.deepEqual(
      titles([
        task({ title: "tomorrow, later", deadline: inHours(30) }),
        task({ title: "tomorrow, sooner", deadline: inHours(20) }),
      ]),
      ["tomorrow, sooner", "tomorrow, later"],
    );
  });

  it("doesn't recommend optional work with no deadline", () => {
    assert.equal(isRecommended(score({ priority: "low" })), false);
    assert.equal(isRecommended(score({ priority: "medium" })), true);
  });

  it("describes its own rules, including the ones that give nothing", () => {
    const labels = RANKING_RULES.map(({ label }) => label).join();
    for (const word of ["Overdue", "No deadline", "stakeholder", "Waiting", "urgent"]) {
      assert.ok(labels.includes(word), word);
    }
  });
});

describe("deadline risk", () => {
  const risk = (overrides: Partial<Task>) =>
    assessDeadlineRisk(task(overrides), NOW, ZONE);

  it("isn't at risk with no deadline, or when finished", () => {
    assert.equal(risk({ deadline: null }), null);
    assert.equal(risk({ deadline: inHours(1), status: "done" }), null);
  });

  it("treats an overdue task as missed, not at risk", () => {
    assert.equal(risk({ deadline: inDays(-1) }), null);
  });

  it("flags work due soon that hasn't started", () => {
    assert.equal(risk({ deadline: inDays(1) }), "Due tomorrow, and not started");
    assert.equal(risk({ deadline: inDays(1), status: "inbox" }), "Due tomorrow, and not started");
  });

  it("doesn't flag work that's already under way", () => {
    assert.equal(risk({ deadline: inDays(1), status: "in_progress" }), null);
  });

  it("doesn't flag unstarted work with plenty of time", () => {
    assert.equal(risk({ deadline: inDays(6) }), null);
  });

  it("flags waiting work due soon", () => {
    assert.equal(
      risk({ deadline: inDays(2), status: "waiting", waitingFor: "IT" }),
      "Due Fri 6 Nov, and still waiting for IT",
    );
    assert.equal(
      risk({ deadline: inDays(2), status: "waiting" }),
      "Due Fri 6 Nov, and still waiting on someone",
    );
  });

  it("flags work needing more time than the clock allows, even if started", () => {
    assert.equal(
      risk({ deadline: inHours(2), estimatedMinutes: 300, status: "in_progress" }),
      "Needs 5h, and only 2h is left",
    );
  });

  it("uses the clock only, so a long task with days left is fine", () => {
    assert.equal(risk({ deadline: inDays(5), estimatedMinutes: 600 }), null);
  });
});

describe("parseAvailableMinutes", () => {
  it("accepts a sensible number of minutes", () => {
    assert.equal(parseAvailableMinutes("120"), 120);
    assert.equal(parseAvailableMinutes("1440"), 1440);
  });

  it("treats anything else as not given", () => {
    for (const raw of [undefined, "", "0", "-5", "1441", "abc", "1.5", "99999", ["60"]]) {
      assert.equal(parseAvailableMinutes(raw), null, String(raw));
    }
  });
});

describe("buildPlanHref", () => {
  it("leaves out what isn't set", () => {
    assert.equal(buildPlanHref(null, null), "/plan");
    assert.equal(buildPlanHref(60, WS_A), `/plan?workspace=${WS_A}&minutes=60`);
  });
});

describe("buildDailyPlan", () => {
  const context = (availableMinutes: number | null = null) => ({
    workspaces: [
      { id: WS_A, name: "GoMyCode", color: "#2563eb" },
      { id: WS_B, name: "Second job", color: "#c2410c" },
    ],
    stakeholders: [{ id: "s-1", name: "Nadia" }],
    now: NOW,
    timeZone: ZONE,
    availableMinutes,
  });
  const names = (items: { title: string }[]) => items.map((item) => item.title);

  it("picks the three most important tasks, with reasons", () => {
    const plan = buildDailyPlan(
      [
        task({ title: "a", deadline: inDays(-3), priority: "critical" }),
        task({ title: "b", deadline: inHours(3), priority: "high" }),
        task({ title: "c", deadline: inDays(1), priority: "high" }),
        task({ title: "d", deadline: inDays(6), priority: "medium" }),
      ],
      context(),
    );
    assert.deepEqual(names(plan.topThree), ["a", "b", "c"]);
    assert.deepEqual(plan.topThree[0].reasons, ["Overdue by 3 days", "Critical priority"]);
  });

  it("lists other work due by today, and leaves the rest out", () => {
    const plan = buildDailyPlan(
      [
        task({ title: "a", deadline: inDays(-3), priority: "critical" }),
        task({ title: "b", deadline: inDays(-2), priority: "critical" }),
        task({ title: "c", deadline: inDays(-1), priority: "critical" }),
        task({ title: "due today", deadline: inHours(3), priority: "low" }),
        task({ title: "next week", deadline: inDays(6), priority: "medium" }),
      ],
      context(),
    );
    assert.deepEqual(names(plan.alsoToday), ["due today"]);
    assert.deepEqual(plan.alsoFits, []);
    assert.equal(plan.time, null);
  });

  it("makes no assumption about capacity when no time is given", () => {
    const plan = buildDailyPlan(
      [task({ title: "huge", estimatedMinutes: 6000, priority: "critical" })],
      context(),
    );
    assert.deepEqual(names(plan.topThree), ["huge"]);
    assert.deepEqual(plan.doesNotFit, []);
  });

  it("fits work into the time given, skipping what's too long", () => {
    const plan = buildDailyPlan(
      [
        task({ title: "too long", priority: "critical", deadline: inDays(-1), estimatedMinutes: 180 }),
        task({ title: "fits", priority: "high", deadline: inHours(4), estimatedMinutes: 60 }),
        task({ title: "also fits", priority: "medium", deadline: inDays(3), estimatedMinutes: 45 }),
        task({ title: "no room left", priority: "medium", deadline: inDays(6), estimatedMinutes: 60 }),
      ],
      context(120),
    );
    assert.deepEqual(names(plan.topThree), ["fits", "also fits"]);
    assert.deepEqual(names(plan.doesNotFit), ["too long", "no room left"]);
    assert.equal(plan.doesNotFit[0].reasons[0], "Needs 3h, and you have 2h");
    assert.equal(plan.doesNotFit[1].reasons[0], "Needs 1h, and you'd have 15m");
    assert.deepEqual(plan.time, {
      availableMinutes: 120,
      plannedMinutes: 105,
      unestimatedCount: 0,
    });
  });

  it("never invents a duration for tasks with no estimate", () => {
    const plan = buildDailyPlan(
      [
        task({ title: "unknown", priority: "critical", estimatedMinutes: null }),
        task({ title: "known", priority: "high", estimatedMinutes: 30 }),
      ],
      context(30),
    );
    assert.deepEqual(names(plan.topThree), ["unknown", "known"]);
    assert.ok(plan.topThree[0].reasons.at(-1)?.includes("No estimate"));
    assert.deepEqual(plan.time, {
      availableMinutes: 30,
      plannedMinutes: 30,
      unestimatedCount: 1,
    });
  });

  it("offers more work that fits once the top three are chosen", () => {
    const plan = buildDailyPlan(
      Array.from({ length: 5 }, (_, index) =>
        task({ title: `t${index}`, priority: "medium", estimatedMinutes: 10, deadline: inDays(5 + index / 10) }),
      ),
      context(240),
    );
    assert.equal(plan.topThree.length, 3);
    assert.equal(plan.alsoFits.length, 2);
    assert.equal(plan.time?.plannedMinutes, 50);
  });

  it("lists follow-ups, soonest deadline first, saying who and how long", () => {
    const plan = buildDailyPlan(
      [
        task({ title: "no deadline", status: "waiting", waitingFor: "IT", updatedAt: inDays(-6) }),
        task({ title: "soon", waitingFor: "Nadia", deadline: inDays(2), updatedAt: inDays(-1) }),
        task({ title: "done", status: "done", waitingFor: "Nadia" }),
      ],
      context(),
    );
    assert.deepEqual(names(plan.followUps), ["soon", "no deadline"]);
    assert.deepEqual(plan.followUps[0].reasons, ["Waiting for Nadia", "Due Fri 6 Nov"]);
    assert.deepEqual(plan.followUps[1].reasons, ["Waiting for IT", "No change in 6 days"]);
    assert.deepEqual(plan.topThree, []);
  });

  const threeOverdue = () =>
    Array.from({ length: 3 }, (_, index) =>
      task({ title: `top ${index}`, priority: "critical", deadline: inDays(-1) }),
    );

  it("lists tasks at risk, soonest first, with the reason", () => {
    const plan = buildDailyPlan(
      [
        ...threeOverdue(),
        task({ title: "later", deadline: inDays(2) }),
        task({ title: "sooner", deadline: inDays(1) }),
        task({ title: "fine", deadline: inDays(6) }),
      ],
      context(),
    );
    assert.deepEqual(names(plan.atRisk), ["sooner", "later"]);
    assert.deepEqual(plan.atRisk[0].reasons, ["Due tomorrow, and not started"]);
  });

  it("doesn't repeat a task already in the top three or due today", () => {
    const plan = buildDailyPlan(
      [
        task({ title: "top", priority: "critical", deadline: inHours(3) }),
        ...threeOverdue(),
        task({ title: "also today", priority: "low", deadline: inHours(4) }),
      ],
      context(),
    );
    assert.deepEqual(names(plan.alsoToday), ["top", "also today"]);
    assert.deepEqual(plan.atRisk, []);
  });

  it("doesn't repeat a task that won't fit in the time", () => {
    const plan = buildDailyPlan(
      [task({ title: "long", deadline: inDays(1), estimatedMinutes: 300 })],
      context(60),
    );
    assert.deepEqual(names(plan.doesNotFit), ["long"]);
    assert.deepEqual(plan.atRisk, []);
  });

  it("keeps a waiting task at risk, since it's not on the to-do lists", () => {
    const plan = buildDailyPlan(
      [task({ title: "waiting", status: "waiting", deadline: inDays(2) })],
      context(),
    );
    assert.deepEqual(names(plan.atRisk), ["waiting"]);
    assert.deepEqual(names(plan.followUps), ["waiting"]);
  });

  it("doesn't state a task's effort twice", () => {
    const quick = buildDailyPlan(
      [task({ estimatedMinutes: 20, deadline: inDays(6) })],
      context(120),
    ).topThree[0];
    assert.deepEqual(quick.reasons, ["Due Tue 10 Nov", "Medium priority", "Quick: about 20m"]);

    const normal = buildDailyPlan(
      [task({ estimatedMinutes: 60, deadline: inDays(6) })],
      context(120),
    ).topThree[0];
    assert.equal(normal.reasons.at(-1), "Takes about 1h");

    const tooLong = buildDailyPlan(
      [task({ estimatedMinutes: 300, deadline: inHours(1) })],
      context(60),
    ).doesNotFit[0];
    assert.equal(tooLong.reasons.filter((reason) => reason.startsWith("Needs")).length, 1);
  });

  it("includes the workspace and stakeholder for each item", () => {
    const [item] = buildDailyPlan(
      [task({ workspaceId: WS_B, stakeholderId: "s-1" })],
      context(),
    ).topThree;
    assert.equal(item.workspace?.name, "Second job");
    assert.equal(item.stakeholderName, "Nadia");
  });

  it("is empty when there's nothing to do", () => {
    const plan = buildDailyPlan([], context(60));
    assert.deepEqual(plan.topThree, []);
    assert.deepEqual(plan.followUps, []);
    assert.deepEqual(plan.atRisk, []);
    assert.equal(plan.time?.plannedMinutes, 0);
  });
});
