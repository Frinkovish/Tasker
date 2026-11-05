import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { AssistantMessage, AssistantProposal } from "../domain/assistant.ts";
import { buildConversationTitle } from "../domain/assistant.ts";
import type { Task } from "../domain/task.ts";
import type { Project, Stakeholder, Workspace } from "../domain/workspace.ts";

import { MAX_TOOL_ROUNDS, runConversation, type ModelStep } from "./loop.ts";
import {
  buildContextMessage,
  buildHistoryMessages,
} from "./prompt.ts";
import {
  buildTaskUpdateProposal,
  describeProposal,
  findChangedField,
  toTaskUpdateInput,
} from "./proposals.ts";
import type { AssistantSnapshot, ReadContext } from "./read-tools.ts";
import { createToolDefinitions, createToolRunner } from "./tools.ts";
import { buildMessageViews } from "./view.ts";

const ZONE = "Africa/Tunis";
// A Thursday, at 11:00 in Tunis.
const NOW = new Date("2026-11-05T10:00:00Z");

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const WORK = id(1);
const OTHER = id(2);
const EMMA = id(3);
const NADIA = id(4);
const ELD = id(5);
const DASHBOARD = id(10);
const REPORT = id(11);
const INVOICE = id(12);
const FINISHED = id(13);

const workspace = (wsId: string, name: string): Workspace => ({
  id: wsId,
  name,
  description: "",
  color: "#112233",
  createdAt: NOW,
  updatedAt: NOW,
});

const stakeholder = (sId: string, workspaceId: string, name: string): Stakeholder => ({
  id: sId,
  workspaceId,
  name,
  role: "Lead",
  contactDetails: "secret@example.invalid",
  createdAt: NOW,
});

function task(overrides: Partial<Task>): Task {
  return {
    id: DASHBOARD,
    workspaceId: WORK,
    stakeholderId: null,
    projectId: null,
    title: "A task",
    description: null,
    sourceRequest: "The original words",
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

const TASKS: Task[] = [
  task({
    id: DASHBOARD,
    title: "Update the dashboard",
    stakeholderId: EMMA,
    sourceRequest: "Emma asked for the dashboard update",
    deadline: new Date("2026-11-03T22:59:59Z"),
    priority: "high",
    estimatedMinutes: 60,
  }),
  task({
    id: REPORT,
    workspaceId: OTHER,
    title: "Send the report",
    stakeholderId: NADIA,
    waitingFor: "Nadia",
    sourceRequest: "Send Nadia the report once she replies",
    updatedAt: new Date("2026-10-30T10:00:00Z"),
  }),
  task({
    id: INVOICE,
    workspaceId: OTHER,
    title: "Check the invoice",
    sourceRequest: "Please check the invoice, Emma mentioned it",
    updatedAt: new Date("2026-10-20T10:00:00Z"),
    estimatedMinutes: 30,
  }),
  task({
    id: FINISHED,
    title: "Old request",
    stakeholderId: EMMA,
    status: "done",
    completedAt: NOW,
  }),
];

const snapshot: AssistantSnapshot = {
  workspaces: [workspace(WORK, "GoMyCode"), workspace(OTHER, "Second job")],
  stakeholders: [stakeholder(EMMA, WORK, "Emma Stone"), stakeholder(NADIA, OTHER, "Nadia")],
  projects: [
    {
      id: ELD,
      workspaceId: WORK,
      name: "ELD",
      description: "",
      status: "active",
      createdAt: NOW,
    } as Project,
  ],
  tasks: TASKS,
  captures: [
    { id: id(20), sourceText: "Emma wants the slides too", createdAt: new Date("2026-11-01T10:00:00Z") },
  ],
};

const context: ReadContext = { snapshot, now: NOW, timeZone: ZONE };
const noExtras = async () => ({ subtasks: [], notes: [] });
const newRunner = (userMessage = "A question") =>
  createToolRunner(context, noExtras, userMessage);

async function call(name: string, args: unknown, runner = newRunner()) {
  return JSON.parse(await runner.run(name, JSON.stringify(args)));
}

const ALL_FILTERS = {
  workspace_id: null,
  status: "active",
  deadline: null,
  priority: null,
  person: null,
  project: null,
  text: null,
};

describe("reading tools", () => {
  it("finds overdue tasks, with the count from the app", async () => {
    const result = await call("find_tasks", { ...ALL_FILTERS, deadline: "overdue" });
    assert.equal(result.total, 1);
    assert.equal(result.tasks[0].title, "Update the dashboard");
    assert.equal(result.tasks[0].deadline_status, "Overdue by 2 days");
    assert.equal(result.tasks[0].workspace, "GoMyCode");
  });

  it("returns an empty result rather than anything made up", async () => {
    const result = await call("find_tasks", { ...ALL_FILTERS, text: "nonexistent" });
    assert.equal(result.total, 0);
    assert.deepEqual(result.tasks, []);
  });

  it("limits a search to one workspace", async () => {
    const result = await call("find_tasks", { ...ALL_FILTERS, workspace_id: OTHER });
    assert.deepEqual(
      result.tasks.map((item: { workspace: string }) => item.workspace),
      ["Second job", "Second job"],
    );
  });

  it("finds what someone asked for, linked or only named, and unreviewed requests", async () => {
    const result = await call("find_tasks", {
      ...ALL_FILTERS,
      status: "all",
      person: "Emma",
    });
    assert.deepEqual(
      new Set(result.tasks.map((item: { id: string }) => item.id)),
      new Set([DASHBOARD, INVOICE, FINISHED]),
    );
    assert.equal(result.tasks[0].original_request.length > 0, true);
    assert.equal(result.unreviewed_requests[0].text, "Emma wants the slides too");
  });

  it("says when nobody has that name", async () => {
    const result = await call("find_tasks", { ...ALL_FILTERS, person: "Zed" });
    assert.equal(result.total, 0);
    assert.match(result.note, /No stakeholder/);
  });

  it("only sends the original request when the question is about what was asked", async () => {
    const result = await call("find_tasks", ALL_FILTERS);
    assert.equal("original_request" in result.tasks[0], false);
  });

  it("never sends contact details", async () => {
    const runner = newRunner();
    const outputs = await Promise.all([
      runner.run("find_tasks", JSON.stringify({ ...ALL_FILTERS, person: "Emma" })),
      runner.run("list_people_and_projects", JSON.stringify({ workspace_id: null })),
      runner.run("get_task", JSON.stringify({ task_id: DASHBOARD })),
      runner.run("get_daily_plan", JSON.stringify({ workspace_id: null, available_minutes: null })),
    ]);
    for (const output of outputs) assert.equal(output.includes("secret@"), false);
  });

  it("gives the plan's reasons and fits work into the stated time", async () => {
    const result = await call("get_daily_plan", {
      workspace_id: null,
      available_minutes: 45,
    });
    assert.equal(result.does_not_fit_in_the_time[0].title, "Update the dashboard");
    assert.match(result.does_not_fit_in_the_time[0].reasons[0], /Needs 1h/);
    assert.equal(result.time.available, "45m");
    assert.ok(result.ranking_rules.length > 0);
  });

  it("assumes no time when none is stated", async () => {
    const result = await call("get_daily_plan", {
      workspace_id: null,
      available_minutes: null,
    });
    assert.equal(result.time, null);
    assert.equal(result.most_important[0].title, "Update the dashboard");
  });

  it("counts workload per workspace, and what's missing an estimate", async () => {
    const { workspaces } = await call("get_workload", {});
    assert.deepEqual(
      workspaces.map((item: { workspace: string; open_tasks: number }) => [
        item.workspace,
        item.open_tasks,
      ]),
      [
        ["GoMyCode", 1],
        ["Second job", 2],
      ],
    );
    assert.equal(workspaces[0].overdue, 1);
    assert.equal(workspaces[1].total_estimate, "30m");
    assert.equal(workspaces[1].tasks_with_no_estimate, 1);
  });

  it("lists forgotten work, with each task only once", async () => {
    const result = await call("get_forgotten_work", { workspace_id: null });
    assert.equal(result.unreviewed_requests.total, 1);
    assert.equal(result.overdue.items[0].title, "Update the dashboard");
    assert.equal(result.follow_ups_gone_quiet.items[0].title, "Send the report");
    assert.equal(result.follow_ups_gone_quiet.items[0].days_unchanged, 6);
    assert.equal(result.no_deadline_and_untouched.items[0].title, "Check the invoice");
    assert.equal(result.no_deadline_and_untouched.total, 1);
  });

  it("reads a whole task, and refuses an id that isn't one of the user's", async () => {
    const runner = createToolRunner(
      context,
      async () => ({
        subtasks: [
          { id: id(30), taskId: DASHBOARD, title: "Pull figures", status: "todo", createdAt: NOW, completedAt: null },
        ],
        notes: [{ id: id(31), taskId: DASHBOARD, body: "A note", createdAt: NOW }],
      }),
      "A question",
    );
    const result = await call("get_task", { task_id: DASHBOARD }, runner);
    assert.equal(result.original_request, "Emma asked for the dashboard update");
    assert.equal(result.subtasks[0].title, "Pull figures");
    assert.equal(result.notes[0].body, "A note");

    const missing = await call("get_task", { task_id: id(99) }, runner);
    assert.match(missing.error, /No task/);
  });

  it("rejects a workspace that isn't the user's, and bad arguments in general", async () => {
    const result = await call("find_tasks", { ...ALL_FILTERS, workspace_id: id(99) });
    assert.match(result.error, /Invalid arguments/);

    const runner = newRunner();
    assert.match(await runner.run("find_tasks", "{not json"), /valid JSON/);
    assert.match(await runner.run("drop_tables", "{}"), /no tool/);
    assert.match(await runner.run("constructor", "{}"), /no tool/);
  });

  it("lets a database failure end the turn instead of looking like no results", async () => {
    const runner = createToolRunner(
      context,
      async () => {
        throw new Error("database down");
      },
      "A question",
    );
    await assert.rejects(
      runner.run("get_task", JSON.stringify({ task_id: DASHBOARD })),
      /database down/,
    );
  });
});

describe("tool definitions", () => {
  it("are what strict mode needs: closed objects with every field required", () => {
    const check = (schema: Record<string, unknown>) => {
      if (schema.type === "object") {
        assert.equal(schema.additionalProperties, false);
        const properties = Object.keys((schema.properties ?? {}) as object);
        assert.deepEqual(
          [...((schema.required ?? []) as string[])].sort(),
          [...properties].sort(),
        );
      }
      for (const value of Object.values(schema)) {
        if (value && typeof value === "object") check(value as Record<string, unknown>);
      }
    };
    for (const tool of createToolDefinitions([WORK, OTHER])) {
      assert.equal(tool.function.strict, true);
      check(tool.function.parameters as Record<string, unknown>);
    }
  });

  it("offer no tool that writes directly, or one to move a task between workspaces", () => {
    const names = createToolDefinitions([WORK]).map(({ function: tool }) => tool.name);
    const writers = names.filter((name) => !/^(get|find|list|propose)_/.test(name));
    assert.deepEqual(writers, []);
    const change = createToolDefinitions([WORK]).find(
      ({ function: tool }) => tool.name === "propose_task_change",
    );
    const text = JSON.stringify(change);
    assert.equal(text.includes("workspaceId"), false);
    assert.equal(text.includes("stakeholderId"), false);
    assert.equal(text.includes("sourceRequest"), false);
  });
});

describe("proposing changes", () => {
  const dashboard = TASKS[0];

  it("records a proposal and changes nothing", async () => {
    const runner = newRunner();
    const result = await call(
      "propose_task_change",
      {
        task_id: DASHBOARD,
        changes: [{ field: "deadline", value: "2026-11-06" }],
      },
      runner,
    );
    assert.equal(result.status, "awaiting_user_confirmation");
    assert.match(result.note, /Nothing has changed/);
    assert.equal(runner.proposals.length, 1);
    assert.deepEqual(runner.proposals[0], {
      taskId: DASHBOARD,
      payload: {
        kind: "update_task",
        changes: [
          {
            field: "deadline",
            before: "2026-11-03T22:59:59.000Z",
            // End of 6 November in Tunis, which is an hour ahead of UTC.
            after: "2026-11-06T22:59:59.000Z",
          },
        ],
      },
    });
    assert.equal(dashboard.deadline?.toISOString(), "2026-11-03T22:59:59.000Z");
  });

  it("reads a date with a time in the user's zone", () => {
    const result = buildTaskUpdateProposal(
      dashboard,
      [{ field: "deadline", value: "2026-11-06 14:30" }],
      ZONE,
    );
    assert.ok(result.ok);
    assert.equal(result.changes[0].after, "2026-11-06T13:30:00.000Z");
  });

  const rejected: [string, string, string | null, RegExp][] = [
    ["an impossible date", "deadline", "2026-02-31", /valid date/],
    ["a phrase instead of a date", "deadline", "Friday", /must look like/],
    ["an unknown status", "status", "archived", /./],
    ["an unknown priority", "priority", "urgent", /./],
    ["an estimate that isn't whole minutes", "estimatedMinutes", "2 hours", /whole number/],
    ["an empty title", "title", "   ", /Enter a title/],
    ["a title that's too long", "title", "x".repeat(201), /under 200/],
  ];
  for (const [name, field, value, message] of rejected) {
    it(`rejects ${name}`, () => {
      const result = buildTaskUpdateProposal(
        dashboard,
        [{ field: field as "title", value }],
        ZONE,
      );
      assert.equal(result.ok, false);
      if (!result.ok) assert.match(result.message, message);
    });
  }

  it("rejects a change to the same value, and the same field twice", () => {
    const same = buildTaskUpdateProposal(dashboard, [{ field: "priority", value: "high" }], ZONE);
    assert.equal(same.ok, false);
    const twice = buildTaskUpdateProposal(
      dashboard,
      [
        { field: "priority", value: "low" },
        { field: "priority", value: "medium" },
      ],
      ZONE,
    );
    assert.equal(twice.ok, false);
  });

  it("can't touch a field outside the allowed list", async () => {
    const result = await call("propose_task_change", {
      task_id: DASHBOARD,
      changes: [{ field: "workspaceId", value: OTHER }],
    });
    assert.match(result.error, /Invalid arguments/);
  });

  it("refuses a task that isn't the user's", async () => {
    const runner = newRunner();
    const result = await call(
      "propose_task_change",
      { task_id: id(99), changes: [{ field: "priority", value: "low" }] },
      runner,
    );
    assert.match(result.error, /No task/);
    assert.equal(runner.proposals.length, 0);
  });

  it("allows one change per task and a few proposals in a reply", async () => {
    const runner = newRunner();
    const change = (taskId: string, value: string) =>
      call("propose_task_change", { task_id: taskId, changes: [{ field: "priority", value }] }, runner);
    await change(DASHBOARD, "low");
    const again = await change(DASHBOARD, "critical");
    assert.match(again.error, /already prepared/);

    for (let n = 0; n < 4; n++) {
      await call("propose_note", { task_id: REPORT, body: `Note ${n}` }, runner);
    }
    assert.equal(runner.proposals.length, 5);
    const sixth = await call("propose_subtask", { task_id: REPORT, title: "One more" }, runner);
    assert.match(sixth.error, /Only 5/);
  });

  describe("when a search matched several tasks", () => {
    const lowerPriority = (taskId: string, runner: ReturnType<typeof newRunner>) =>
      call(
        "propose_task_change",
        { task_id: taskId, changes: [{ field: "priority", value: "critical" }] },
        runner,
      );
    const search = (text: string | null, runner: ReturnType<typeof newRunner>) =>
      call("find_tasks", { ...ALL_FILTERS, text }, runner);

    it("refuses to guess, and says what matched", async () => {
      const runner = newRunner("Raise the priority of the report");
      await search(null, runner);
      const result = await lowerPriority(DASHBOARD, runner);
      assert.match(result.error, /matched 3 tasks/);
      assert.match(result.error, /"Update the dashboard"/);
      assert.equal(runner.proposals.length, 0);
    });

    it("refuses notes and subtasks in the same way", async () => {
      const runner = newRunner("Add a note");
      await search(null, runner);
      assert.match(
        (await call("propose_note", { task_id: REPORT, body: "Hi" }, runner)).error,
        /matched 3 tasks/,
      );
      assert.match(
        (await call("propose_subtask", { task_id: REPORT, title: "Hi" }, runner)).error,
        /matched 3 tasks/,
      );
    });

    it("allows it once a narrower search finds just one", async () => {
      const runner = newRunner("Raise the priority of the dashboard task");
      await search(null, runner);
      await lowerPriority(DASHBOARD, runner);
      await search("dashboard", runner);
      assert.equal((await lowerPriority(DASHBOARD, runner)).status, "awaiting_user_confirmation");
    });

    it("allows it when the user asks for all of them", async () => {
      for (const words of ["Raise all of them", "Change both", "Modifie les deux", "Toutes les tâches"]) {
        const runner = newRunner(words);
        await search(null, runner);
        assert.equal(
          (await lowerPriority(DASHBOARD, runner)).status,
          "awaiting_user_confirmation",
          words,
        );
      }
    });

    it("isn't fooled by a word that only contains \"all\"", async () => {
      const runner = newRunner("Finally call the supplier, it's a small thing");
      await search(null, runner);
      assert.match((await lowerPriority(DASHBOARD, runner)).error, /matched 3 tasks/);
    });

    it("doesn't apply when no search was needed, such as after an earlier reply", async () => {
      const runner = newRunner("Move it");
      assert.equal((await lowerPriority(DASHBOARD, runner)).status, "awaiting_user_confirmation");
    });

    it("doesn't apply to a task the search didn't return", async () => {
      const runner = newRunner("Change the invoice");
      await call("find_tasks", { ...ALL_FILTERS, workspace_id: OTHER }, runner);
      assert.equal((await lowerPriority(DASHBOARD, runner)).status, "awaiting_user_confirmation");
    });
  });

  it("checks notes and subtasks like the forms do", async () => {
    assert.match((await call("propose_note", { task_id: REPORT, body: "  " })).error, /Write the note/);
    assert.match(
      (await call("propose_subtask", { task_id: REPORT, title: "x".repeat(201) })).error,
      /under 200/,
    );
  });

  it("clears a deadline or a waiting-for with null", () => {
    const result = buildTaskUpdateProposal(
      { ...dashboard, waitingFor: "Emma" },
      [
        { field: "deadline", value: null },
        { field: "waitingFor", value: null },
      ],
      ZONE,
    );
    assert.ok(result.ok);
    assert.deepEqual(result.changes.map(({ after }) => after), [null, null]);
  });

  it("fills the edit form from the task, only altering what was proposed", () => {
    const input = toTaskUpdateInput(
      {
        ...dashboard,
        description: "Keep this",
        stakeholderId: EMMA,
        nextAction: "Pull figures",
      },
      [{ field: "priority", before: "high", after: "low" }],
      ZONE,
    );
    assert.deepEqual(input, {
      title: "Update the dashboard",
      description: "Keep this",
      stakeholderId: EMMA,
      projectId: "",
      status: "todo",
      priority: "low",
      deadlineDate: "2026-11-03",
      deadlineTime: "",
      estimatedMinutes: "60",
      nextAction: "Pull figures",
      waitingFor: "",
    });
  });

  it("notices when a field has moved on, but not when another one has", () => {
    const changes = [
      { field: "priority" as const, before: "high", after: "low" },
    ];
    assert.equal(findChangedField(dashboard, changes), null);
    assert.equal(findChangedField({ ...dashboard, title: "Renamed" }, changes), null);
    assert.equal(findChangedField({ ...dashboard, priority: "critical" }, changes), "Priority");
  });

  it("describes a change in plain terms, and warns about a date in the past", () => {
    const rows = describeProposal(
      {
        kind: "update_task",
        changes: [
          { field: "deadline", before: "2026-11-03T22:59:59.000Z", after: "2026-11-06T13:30:00.000Z" },
          { field: "status", before: "todo", after: "done" },
          { field: "estimatedMinutes", before: null, after: "90" },
        ],
      },
      NOW,
      ZONE,
    );
    assert.deepEqual(rows[0], {
      label: "Deadline",
      before: "Tue 3 Nov 2026",
      after: "Fri 6 Nov 2026, 14:30",
      warning: null,
    });
    assert.deepEqual(
      [rows[1].before, rows[1].after, rows[2].before, rows[2].after],
      ["To do", "Done", "None", "1h 30m"],
    );

    const [past] = describeProposal(
      {
        kind: "update_task",
        changes: [{ field: "deadline", before: null, after: "2026-11-01T10:00:00.000Z" }],
      },
      NOW,
      ZONE,
    );
    assert.match(past.warning ?? "", /already passed/);
  });
});

const finalStep = (reply: string, ids: string[] = []): ModelStep => ({
  content: JSON.stringify({ reply, referenced_task_ids: ids }),
  toolCalls: [],
  finishReason: "stop",
  refusal: null,
});
const toolStep = (name: string, args: unknown, callId = "call-1"): ModelStep => ({
  content: null,
  toolCalls: [{ id: callId, name, arguments: JSON.stringify(args) }],
  finishReason: "tool_calls",
  refusal: null,
});

describe("the conversation loop", () => {
  const start = [{ role: "user" as const, content: "Hello" }];
  const noTool = async () => {
    throw new Error("No tool should run");
  };

  it("returns an answer that needed no tools", async () => {
    const reply = await runConversation(start, async () => finalStep("Hi"), noTool);
    assert.equal(reply.reply, "Hi");
  });

  it("feeds tool results back, then returns the answer", async () => {
    const seen: string[] = [];
    let step = 0;
    const reply = await runConversation(
      start,
      async (messages) => {
        seen.push(messages.at(-1)?.role ?? "");
        return step++ === 0 ? toolStep("find_tasks", {}) : finalStep("Found it", [DASHBOARD]);
      },
      async () => '{"total":1}',
    );
    assert.deepEqual(seen, ["user", "tool"]);
    assert.deepEqual(reply.referenced_task_ids, [DASHBOARD]);
  });

  it("stops offering tools after the limit, and fails if the model won't stop", async () => {
    const offered: boolean[] = [];
    await assert.rejects(
      runConversation(
        start,
        async (_messages, { allowTools }) => {
          offered.push(allowTools);
          return toolStep("find_tasks", {});
        },
        async () => "{}",
      ),
      /kept asking/,
    );
    assert.equal(offered.length, MAX_TOOL_ROUNDS + 1);
    assert.equal(offered.at(-1), false);
  });

  it("answers once tools are withdrawn", async () => {
    const reply = await runConversation(
      start,
      async (_messages, { allowTools }) =>
        allowTools ? toolStep("find_tasks", {}) : finalStep("Best answer I have"),
      async () => "{}",
    );
    assert.equal(reply.reply, "Best answer I have");
  });

  const unusable: [string, ModelStep][] = [
    ["a refusal", { content: null, toolCalls: [], finishReason: "stop", refusal: "No" }],
    ["a filtered reply", { content: null, toolCalls: [], finishReason: "content_filter", refusal: null }],
    ["a cut-off reply", { content: '{"reply":"Hel', toolCalls: [], finishReason: "length", refusal: null }],
    ["text that isn't JSON", { content: "plain", toolCalls: [], finishReason: "stop", refusal: null }],
    ["the wrong shape", { content: '{"answer":"x"}', toolCalls: [], finishReason: "stop", refusal: null }],
    ["an empty reply", { content: '{"reply":"  ","referenced_task_ids":[]}', toolCalls: [], finishReason: "stop", refusal: null }],
  ];
  for (const [name, step] of unusable) {
    it(`fails on ${name}`, async () => {
      await assert.rejects(runConversation(start, async () => step, noTool));
    });
  }

  it("answers every call in a round, even past the limit", async () => {
    const calls = Array.from({ length: 10 }, (_, n) => ({
      id: `c${n}`,
      name: "find_tasks",
      arguments: "{}",
    }));
    let ran = 0;
    let toolMessages = 0;
    let step = 0;
    await runConversation(
      start,
      async (messages) => {
        if (step++ === 0) {
          return { content: null, toolCalls: calls, finishReason: "tool_calls", refusal: null };
        }
        toolMessages = messages.filter(({ role }) => role === "tool").length;
        return finalStep("Done");
      },
      async () => {
        ran++;
        return "{}";
      },
    );
    assert.equal(ran, 8);
    // The API rejects a request if any call goes unanswered.
    assert.equal(toolMessages, 10);
  });
});

const proposal = (overrides: Partial<AssistantProposal> = {}): AssistantProposal => ({
  id: id(40),
  messageId: id(41),
  taskId: DASHBOARD,
  payload: {
    kind: "update_task",
    changes: [{ field: "priority", before: "high", after: "low" }],
  },
  status: "pending",
  createdAt: NOW,
  resolvedAt: null,
  ...overrides,
});

const message = (overrides: Partial<AssistantMessage>): AssistantMessage => ({
  id: id(41),
  conversationId: id(42),
  role: "assistant",
  content: "A reply",
  referencedTaskIds: [],
  createdAt: NOW,
  proposals: [],
  ...overrides,
});

describe("what the model is told", () => {
  it("gets the date, a calendar and the real workspaces", () => {
    const text = buildContextMessage(snapshot.workspaces, NOW, ZONE);
    assert.match(text, /It's 11:00 in Africa\/Tunis/);
    assert.match(text, /Thursday 2026-11-05 \(today\)/);
    assert.match(text, /Friday 2026-11-06 \(tomorrow\)/);
    assert.match(text, /Wednesday 2026-11-18/);
    assert.match(text, new RegExp(`"GoMyCode": workspace_id ${WORK}`));
  });

  it("keeps the calendar right across a clock change", () => {
    const text = buildContextMessage([], new Date("2026-10-24T22:30:00Z"), "Europe/Paris");
    assert.match(text, /Sunday 2026-10-25 \(today\)/);
    assert.match(text, /Monday 2026-10-26 \(tomorrow\)/);
  });

  it("gets a record of which tasks a reply meant and what became of its proposals", () => {
    const history = buildHistoryMessages(
      [
        message({ role: "user", content: "Lower it" }),
        message({
          referencedTaskIds: [DASHBOARD, id(99)],
          proposals: [proposal({ status: "applied" })],
        }),
      ],
      TASKS,
      NOW,
      ZONE,
    );
    assert.deepEqual(history.map(({ role }) => role), ["user", "assistant", "system"]);
    const note = history[2].content ?? "";
    assert.match(note, /Tasks mentioned: "Update the dashboard"/);
    assert.equal(note.includes(id(99)), false);
    assert.match(note, /Priority: High to Low/);
    assert.match(note, /confirmed by the user and applied/);
  });

  it("is told plainly that an unconfirmed or dismissed change didn't happen", () => {
    const note = (status: AssistantProposal["status"]) =>
      buildHistoryMessages(
        [message({ proposals: [proposal({ status })] })],
        TASKS,
        NOW,
        ZONE,
      );
    // A history that begins with a reply isn't valid to send on its own.
    assert.deepEqual(note("pending"), []);

    const history = buildHistoryMessages(
      [
        message({ role: "user", content: "Lower it" }),
        message({ proposals: [proposal({ status: "pending" })] }),
        message({ role: "user", content: "No, leave it" }),
        message({ proposals: [proposal({ status: "dismissed" })] }),
      ],
      TASKS,
      NOW,
      ZONE,
    );
    assert.match(history[2].content ?? "", /not confirmed yet, so not applied/);
    assert.match(history[5].content ?? "", /dismissed by the user, so not applied/);
  });

  it("only sends the recent past, starting from a question", () => {
    const long = Array.from({ length: 41 }, (_, n) =>
      message({ role: n % 2 === 0 ? "user" : "assistant", content: `Message ${n}` }),
    );
    const history = buildHistoryMessages(long, TASKS, NOW, ZONE);
    assert.equal(history[0].role, "user");
    assert.equal(history.at(-1)?.content, "Message 40");
    assert.ok(history.length <= 20);
  });
});

describe("what the user sees", () => {
  it("only links to real tasks, under their current titles", () => {
    const [view] = buildMessageViews(
      [message({ referencedTaskIds: [REPORT, id(99), REPORT] })],
      TASKS,
      snapshot.workspaces,
      NOW,
      ZONE,
    );
    assert.deepEqual(view.references, [{ id: REPORT, title: "Send the report" }]);
  });

  it("builds a proposal from the real task, and doesn't also link to it", () => {
    const [view] = buildMessageViews(
      [message({ referencedTaskIds: [DASHBOARD], proposals: [proposal()] })],
      TASKS,
      snapshot.workspaces,
      NOW,
      ZONE,
    );
    assert.deepEqual(view.references, []);
    assert.equal(view.proposals[0].taskTitle, "Update the dashboard");
    assert.equal(view.proposals[0].workspace?.name, "GoMyCode");
    assert.deepEqual(view.proposals[0].rows, [
      { label: "Priority", before: "High", after: "Low", warning: null },
    ]);
  });
});

describe("conversation titles", () => {
  it("come from the first message, on one line and not too long", () => {
    assert.equal(buildConversationTitle("  What's\n overdue? "), "What's overdue?");
    const long = buildConversationTitle("x".repeat(200));
    assert.equal(long.length, 80);
    assert.ok(long.endsWith("…"));
  });
});
