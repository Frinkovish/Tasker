import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { TaskActivity } from "../domain/task.ts";
import {
  createTaskReviewSchema,
  createTaskUpdateSchema,
} from "../domain/task.ts";

import { describeActivity } from "./activity.ts";

const NADIA = "aaaaaaaa-0000-4000-8000-000000000001";
const REMOVED = "aaaaaaaa-0000-4000-8000-000000000099";
const WORKSPACE = "11111111-1111-4111-8111-111111111111";

const CONTEXT = {
  stakeholders: [{ id: NADIA, name: "Nadia" }],
  projects: [],
  timeZone: "UTC",
};

function updated(
  previousValue: Record<string, unknown>,
  newValue: Record<string, unknown>,
): TaskActivity {
  return {
    id: "a",
    taskId: "t",
    action: "updated",
    previousValue,
    newValue,
    createdAt: new Date("2026-11-04T10:00:00Z"),
  };
}

describe("describeActivity", () => {
  it("describes task creation", () => {
    const entry: TaskActivity = {
      ...updated({}, {}),
      action: "created",
      previousValue: null,
      newValue: { title: "x" },
    };
    assert.deepEqual(describeActivity(entry, CONTEXT), ["Task created"]);
  });

  it("uses readable status and priority names", () => {
    assert.deepEqual(
      describeActivity(
        updated(
          { status: "in_progress", priority: "low" },
          { status: "done", priority: "critical" },
        ),
        CONTEXT,
      ),
      [
        "Status changed from In progress to Done",
        "Priority changed from Low to Critical",
      ],
    );
  });

  it("describes setting and clearing a deadline", () => {
    assert.deepEqual(
      describeActivity(
        updated({ deadline: null }, { deadline: "2026-11-06T17:00:00+00:00" }),
        CONTEXT,
      ),
      ["Deadline changed from none to Fri 6 Nov, 17:00"],
    );
    assert.deepEqual(
      describeActivity(
        updated({ deadline: "2026-11-06T17:00:00+00:00" }, { deadline: null }),
        CONTEXT,
      ),
      ["Deadline changed from Fri 6 Nov, 17:00 to none"],
    );
  });

  it("names stakeholders and handles one that was deleted", () => {
    assert.deepEqual(
      describeActivity(
        updated({ stakeholder_id: REMOVED }, { stakeholder_id: NADIA }),
        CONTEXT,
      ),
      ["Stakeholder changed from a removed stakeholder to Nadia"],
    );
  });

  it("summarizes long text instead of repeating it", () => {
    assert.deepEqual(
      describeActivity(
        updated({ description: "old" }, { description: "new" }),
        CONTEXT,
      ),
      ["Description updated"],
    );
  });

  it("shows estimates with units", () => {
    assert.deepEqual(
      describeActivity(
        updated({ estimated_minutes: null }, { estimated_minutes: 30 }),
        CONTEXT,
      ),
      ["Estimate changed from none to 30 min"],
    );
  });
});

describe("task form validation", () => {
  const FORM = {
    title: " Update the dashboard ",
    description: "",
    stakeholderId: "",
    projectId: "",
    status: "todo",
    priority: "medium",
    deadlineDate: "",
    deadlineTime: "",
    estimatedMinutes: "",
    nextAction: "",
    waitingFor: "",
  };
  const update = createTaskUpdateSchema("UTC");
  const review = createTaskReviewSchema("UTC");

  it("stores blank optional fields as null and never invents a deadline", () => {
    const result = update.parse(FORM);
    assert.equal(result.title, "Update the dashboard");
    assert.equal(result.description, null);
    assert.equal(result.stakeholderId, null);
    assert.equal(result.deadline, null);
    assert.equal(result.estimatedMinutes, null);
  });

  it("replaces the two deadline fields with one date", () => {
    const result = update.parse({
      ...FORM,
      deadlineDate: "2026-11-06",
      deadlineTime: "17:00",
    });
    assert.deepEqual(result.deadline, new Date("2026-11-06T17:00:00Z"));
    assert.equal("deadlineDate" in result, false);
  });

  it("rejects a blank title", () => {
    const result = update.safeParse({ ...FORM, title: "   " });
    assert.equal(result.success, false);
    assert.equal(result.error?.issues[0].message, "Enter a title.");
  });

  it("rejects an unknown status or priority", () => {
    assert.equal(update.safeParse({ ...FORM, status: "nope" }).success, false);
    assert.equal(update.safeParse({ ...FORM, priority: "nope" }).success, false);
  });

  it("reports a bad deadline", () => {
    const result = update.safeParse({ ...FORM, deadlineTime: "17:00" });
    assert.equal(result.success, false);
    assert.equal(
      result.error?.issues[0].message,
      "Choose a date to go with that time.",
    );
  });

  it("accepts whole-number estimates only", () => {
    assert.equal(update.parse({ ...FORM, estimatedMinutes: "45" }).estimatedMinutes, 45);
    for (const bad of ["0", "-5", "1.5", "soon"]) {
      assert.equal(
        update.safeParse({ ...FORM, estimatedMinutes: bad }).success,
        false,
        bad,
      );
    }
  });

  it("asks for the workspace when the disabled fields weren't submitted", () => {
    // Browsers leave disabled selects out of the form data.
    const { stakeholderId, projectId, ...withoutRelations } = FORM;
    void stakeholderId;
    void projectId;
    const result = review.safeParse({ ...withoutRelations, workspaceId: "" });
    assert.equal(result.success, false);
    assert.equal(result.error?.issues[0].message, "Choose a workspace.");
  });

  it("treats a missing stakeholder and project as none", () => {
    const { stakeholderId, projectId, ...withoutRelations } = FORM;
    void stakeholderId;
    void projectId;
    const result = review.parse({ ...withoutRelations, workspaceId: WORKSPACE });
    assert.equal(result.stakeholderId, null);
    assert.equal(result.projectId, null);
  });

  it("requires a workspace when reviewing, with no default", () => {
    const result = review.safeParse({ ...FORM, workspaceId: "" });
    assert.equal(result.success, false);
    assert.equal(result.error?.issues[0].message, "Choose a workspace.");
    assert.equal(
      review.parse({ ...FORM, workspaceId: WORKSPACE }).workspaceId,
      WORKSPACE,
    );
  });
});
