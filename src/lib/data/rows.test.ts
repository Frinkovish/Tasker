import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  projectInputSchema,
  stakeholderInputSchema,
  workspaceUpdateSchema,
} from "../domain/workspace.ts";

import { parseStakeholder, parseTask, parseWorkspace } from "./rows.ts";

const ID = "11111111-1111-4111-8111-111111111111";
const OTHER_ID = "22222222-2222-4222-8222-222222222222";
const TIMESTAMP = "2026-11-04T10:00:00+00:00";

const TASK_ROW = {
  id: ID,
  workspace_id: OTHER_ID,
  stakeholder_id: null,
  project_id: null,
  title: "A task",
  description: null,
  source_request: "  Spaces in the user's own words stay  ",
  status: "todo",
  priority: "high",
  deadline: null,
  estimated_minutes: null,
  next_action: null,
  waiting_for: null,
  created_at: TIMESTAMP,
  updated_at: TIMESTAMP,
  completed_at: null,
};

describe("parseTask", () => {
  it("maps columns and converts timestamps to dates", () => {
    const task = parseTask(TASK_ROW);
    assert.equal(task.workspaceId, OTHER_ID);
    assert.deepEqual(task.createdAt, new Date(TIMESTAMP));
  });

  it("keeps a missing deadline as null, not a date", () => {
    assert.equal(parseTask(TASK_ROW).deadline, null);
  });

  it("converts a real deadline", () => {
    const task = parseTask({ ...TASK_ROW, deadline: TIMESTAMP });
    assert.deepEqual(task.deadline, new Date(TIMESTAMP));
  });

  it("preserves the source request exactly", () => {
    assert.equal(
      parseTask(TASK_ROW).sourceRequest,
      "  Spaces in the user's own words stay  ",
    );
  });

  it("rejects a row that doesn't match the domain", () => {
    assert.throws(() => parseTask({ ...TASK_ROW, status: "unknown" }));
  });
});

describe("parseWorkspace", () => {
  it("accepts a workspace with an empty description", () => {
    const workspace = parseWorkspace({
      id: ID,
      name: "GoMyCode",
      description: "",
      color: "#2563eb",
      created_at: TIMESTAMP,
      updated_at: TIMESTAMP,
    });
    assert.equal(workspace.name, "GoMyCode");
  });
});

describe("parseStakeholder", () => {
  it("keeps optional fields as null", () => {
    const stakeholder = parseStakeholder({
      id: ID,
      workspace_id: OTHER_ID,
      name: "Nadia",
      role: null,
      contact_details: null,
      created_at: TIMESTAMP,
    });
    assert.equal(stakeholder.role, null);
    assert.equal(stakeholder.contactDetails, null);
  });
});

describe("form input validation", () => {
  it("rejects a blank workspace name", () => {
    const result = workspaceUpdateSchema.safeParse({
      name: "   ",
      description: "",
      color: "#000000",
    });
    assert.equal(result.success, false);
  });

  it("rejects an invalid workspace colour", () => {
    const result = workspaceUpdateSchema.safeParse({
      name: "Work",
      description: "",
      color: "red",
    });
    assert.equal(result.success, false);
  });

  it("stores blank optional stakeholder fields as null", () => {
    const result = stakeholderInputSchema.parse({
      name: " Nadia ",
      role: "  ",
      contactDetails: "",
    });
    assert.deepEqual(result, { name: "Nadia", role: null, contactDetails: null });
  });

  it("requires a project name", () => {
    const result = projectInputSchema.safeParse({ name: "", description: "" });
    assert.equal(result.success, false);
  });
});
