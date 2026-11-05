import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { buildExtractionUserMessage, EXTRACTION_SYSTEM_PROMPT } from "./prompt.ts";
import { appearsIn } from "../../text.ts";

import {
  sanitizeExtraction,
  type SanitizeContext,
} from "./sanitize.ts";
import {
  extractionJsonSchema,
  extractionOutputSchema,
  type ExtractionOutput,
} from "./schema.ts";

// Wednesday 4 November 2026, 10:00 UTC.
const NOW = new Date("2026-11-04T10:00:00Z");
const ZONE = "Africa/Tunis";

const GOMYCODE = { id: "ws-1", name: "GoMyCode" };
const SECOND_JOB = { id: "ws-2", name: "Second job" };
const NADIA = { id: "s-1", name: "Nadia", workspaceId: "ws-1" };
const EMMA = { id: "s-2", name: "Emma Jones", workspaceId: "ws-2" };
const REPORTING = { id: "p-1", name: "Reporting", workspaceId: "ws-1" };
const ELD = { id: "p-2", name: "ELD", workspaceId: "ws-2" };

const REQUEST = "Emma asked me to update the ELD dashboard before Thursday.";

function context(overrides: Partial<SanitizeContext> = {}): SanitizeContext {
  return {
    requestText: REQUEST,
    workspaces: [GOMYCODE, SECOND_JOB],
    stakeholders: [NADIA, EMMA],
    projects: [REPORTING, ELD],
    now: NOW,
    timeZone: ZONE,
    ...overrides,
  };
}

function output(overrides: Partial<ExtractionOutput> = {}): ExtractionOutput {
  return {
    title: "Update the ELD dashboard",
    description: null,
    workspaceName: null,
    workspaceEvidence: null,
    stakeholderName: null,
    projectName: null,
    deadlinePhrase: null,
    deadlineDate: null,
    deadlineTime: null,
    priority: "medium",
    priorityEvidence: null,
    estimatedMinutes: null,
    estimateEvidence: null,
    nextAction: null,
    questions: [],
    ...overrides,
  };
}

const sanitize = (
  overrides: Partial<ExtractionOutput>,
  contextOverrides: Partial<SanitizeContext> = {},
) => sanitizeExtraction(output(overrides), context(contextOverrides));

describe("appearsIn", () => {
  it("matches whole words, ignoring case and spacing", () => {
    assert.equal(appearsIn("Before  THURSDAY please", "before thursday"), true);
  });

  it("doesn't find a name inside another word", () => {
    assert.equal(appearsIn("Send the sample report", "Sam"), false);
  });

  it("treats curly and straight quotes as the same", () => {
    assert.equal(appearsIn("Emma’s report", "Emma's report"), true);
  });

  it("handles missing phrases and special characters", () => {
    assert.equal(appearsIn("anything", null), false);
    assert.equal(appearsIn("anything", "  "), false);
    assert.equal(appearsIn("Use C++ here (now)", "C++"), true);
  });
});

describe("deadlines are never invented", () => {
  it("drops a date with no phrase behind it", () => {
    const { values, hints } = sanitize({ deadlineDate: "2026-11-05" });
    assert.equal(values.deadlineDate, "");
    assert.equal(hints.deadlineDate, undefined);
  });

  it("drops a phrase the request doesn't contain", () => {
    const { values } = sanitize({
      deadlinePhrase: "by next Monday",
      deadlineDate: "2026-11-09",
    });
    assert.equal(values.deadlineDate, "");
  });

  it("keeps a real deadline and marks it as stated, with the user's words", () => {
    const { values, hints } = sanitize({
      deadlinePhrase: "before Thursday",
      deadlineDate: "2026-11-05",
    });
    assert.equal(values.deadlineDate, "2026-11-05");
    assert.deepEqual(hints.deadlineDate, {
      source: "stated",
      evidence: "before Thursday",
    });
  });

  it("drops a date on the wrong weekday and asks instead", () => {
    const { values, questions } = sanitize({
      deadlinePhrase: "before Thursday",
      deadlineDate: "2026-11-06", // A Friday.
    });
    assert.equal(values.deadlineDate, "");
    assert.ok(questions.some((question) => question.includes("before Thursday")));
  });

  it("checks today and tomorrow, including in French", () => {
    const today = sanitize(
      { deadlinePhrase: "today", deadlineDate: "2026-11-05" },
      { requestText: "Send it today" },
    );
    assert.equal(today.values.deadlineDate, "");

    const correct = sanitize(
      { deadlinePhrase: "demain", deadlineDate: "2026-11-05" },
      { requestText: "Envoie-le demain" },
    );
    assert.equal(correct.values.deadlineDate, "2026-11-05");
  });

  it("asks about a vague deadline rather than picking a date", () => {
    const { values, questions } = sanitize(
      { deadlinePhrase: "soon" },
      { requestText: "Please do this soon" },
    );
    assert.equal(values.deadlineDate, "");
    assert.ok(questions.some((question) => question.includes('"soon"')));
  });

  it("drops an impossible date and asks", () => {
    const { values, questions } = sanitize({
      deadlinePhrase: "before Thursday",
      deadlineDate: "2026-02-31",
    });
    assert.equal(values.deadlineDate, "");
    assert.ok(questions.some((question) => question.includes("before Thursday")));
  });

  it("keeps a passed deadline but points it out", () => {
    const { values, notes } = sanitize(
      { deadlinePhrase: "on 1 November", deadlineDate: "2026-11-01" },
      { requestText: "It was due on 1 November" },
    );
    assert.equal(values.deadlineDate, "2026-11-01");
    assert.match(notes[0], /already passed/);
  });

  it("never invents a time", () => {
    const { values } = sanitize({
      deadlinePhrase: "before Thursday",
      deadlineDate: "2026-11-05",
      deadlineTime: "17:00",
    });
    assert.equal(values.deadlineTime, "");
  });

  it("keeps a time the request states", () => {
    const { values } = sanitize(
      {
        deadlinePhrase: "Thursday at 5pm",
        deadlineDate: "2026-11-05",
        deadlineTime: "17:00",
      },
      { requestText: "Finish it by Thursday at 5pm" },
    );
    assert.equal(values.deadlineTime, "17:00");
  });
});

describe("stakeholders are never invented", () => {
  it("drops a name the request doesn't contain", () => {
    const { values, notes } = sanitize({
      stakeholderName: "Nadia",
      workspaceName: "GoMyCode",
      workspaceEvidence: "dashboard",
    });
    assert.equal(values.stakeholderId, "");
    assert.deepEqual(notes, []);
  });

  it("matches a first name to a saved full name", () => {
    const { values, hints } = sanitize({ stakeholderName: "Emma" });
    assert.equal(values.stakeholderId, "s-2");
    assert.deepEqual(hints.stakeholderId, { source: "stated", evidence: "Emma" });
  });

  it("explains when a named person isn't saved, without creating them", () => {
    const { values, notes } = sanitize(
      { stakeholderName: "Karim" },
      { requestText: "Karim asked me for the numbers" },
    );
    assert.equal(values.stakeholderId, "");
    assert.match(notes[0], /"Karim" isn't saved as a stakeholder/);
  });

  it("asks when a name matches two people in the workspace", () => {
    const { values, questions } = sanitize(
      { stakeholderName: "Emma", workspaceName: "Second job", workspaceEvidence: "Second job" },
      {
        requestText: "Emma asked me, for the Second job",
        stakeholders: [EMMA, { id: "s-3", name: "Emma Stone", workspaceId: "ws-2" }],
      },
    );
    assert.equal(values.stakeholderId, "");
    assert.match(questions[0], /More than one stakeholder/);
  });
});

describe("workspaces are never assumed", () => {
  it("leaves it empty and asks when nothing identifies it", () => {
    const { values, hints, questions } = sanitize(
      {},
      { requestText: "Please update the dashboard" },
    );
    assert.equal(values.workspaceId, "");
    assert.equal(hints.workspaceId, undefined);
    assert.deepEqual(questions, ["Which workspace is this for?"]);
  });

  it("ignores a workspace the user doesn't have", () => {
    const { values } = sanitize({
      workspaceName: "Someone else's company",
      workspaceEvidence: "dashboard",
    });
    assert.equal(values.workspaceId, "");
  });

  it("ignores a suggestion with no evidence in the request", () => {
    const { values } = sanitize(
      { workspaceName: "GoMyCode", workspaceEvidence: "made up reasoning" },
      { requestText: "Please update the dashboard" },
    );
    assert.equal(values.workspaceId, "");
  });

  it("doesn't accept a workspace from the topic of the work alone", () => {
    const { values, questions } = sanitize(
      { workspaceName: "Second job", workspaceEvidence: "dashboard" },
      { requestText: "Update the dashboard filters" },
    );
    assert.equal(values.workspaceId, "");
    assert.deepEqual(questions, ["Which workspace is this for?"]);
  });

  it("doesn't repeat the workspace question using workspace names", () => {
    const { questions } = sanitize(
      { questions: ["Should this be in GoMyCode or Second job?"] },
      { requestText: "Update the dashboard filters" },
    );
    assert.deepEqual(questions, ["Which workspace is this for?"]);
  });

  it("marks a workspace the request names as stated", () => {
    const { values, hints } = sanitize(
      { workspaceName: "GoMyCode" },
      { requestText: "For GoMyCode, update the dashboard" },
    );
    assert.equal(values.workspaceId, "ws-1");
    assert.equal(hints.workspaceId?.source, "stated");
  });

  it("uses a stakeholder found in only one workspace, as a suggestion", () => {
    const { values, hints } = sanitize({ stakeholderName: "Emma" });
    assert.equal(values.workspaceId, "ws-2");
    assert.deepEqual(hints.workspaceId, { source: "suggested", evidence: "Emma" });
  });

  it("uses a project found in only one workspace", () => {
    const { values } = sanitize({ projectName: "ELD" });
    assert.equal(values.workspaceId, "ws-2");
    assert.equal(values.projectId, "p-2");
  });

  it("doesn't choose when the same name exists in both workspaces", () => {
    const { values, questions } = sanitize(
      { stakeholderName: "Sam" },
      {
        requestText: "Sam asked me for this",
        stakeholders: [
          { id: "s-1", name: "Sam", workspaceId: "ws-1" },
          { id: "s-2", name: "Sam", workspaceId: "ws-2" },
        ],
      },
    );
    assert.equal(values.workspaceId, "");
    assert.equal(values.stakeholderId, "");
    assert.deepEqual(questions, ["Which workspace is this for?"]);
  });

  it("asks when the stakeholder and project are in different workspaces", () => {
    const { values, questions } = sanitize(
      { stakeholderName: "Nadia", projectName: "ELD" },
      { requestText: "Nadia asked about the ELD work" },
    );
    assert.equal(values.workspaceId, "");
    assert.match(questions[0], /different workspaces/);
  });

  it("asks when a suggestion contradicts the people named", () => {
    const { values, questions } = sanitize({
      stakeholderName: "Emma",
      workspaceName: "GoMyCode",
      workspaceEvidence: "dashboard",
    });
    assert.equal(values.workspaceId, "");
    assert.match(questions[0], /different workspace/);
  });

  it("lets a named workspace win and flags the mismatch", () => {
    const { values, notes } = sanitize(
      { workspaceName: "GoMyCode", stakeholderName: "Emma" },
      { requestText: "For GoMyCode, Emma wants this" },
    );
    assert.equal(values.workspaceId, "ws-1");
    assert.equal(values.stakeholderId, "");
    assert.match(notes[0], /isn't a stakeholder in GoMyCode/);
  });
});

describe("priority isn't inflated", () => {
  it("caps critical without evidence, and needs a close deadline for high", () => {
    assert.equal(sanitize({ priority: "critical" }).values.priority, "medium");
    assert.equal(
      sanitize({
        priority: "critical",
        deadlinePhrase: "before Thursday",
        deadlineDate: "2026-11-05",
      }).values.priority,
      "high",
    );
  });

  it("doesn't let a far deadline justify high", () => {
    const { values } = sanitize(
      { priority: "high", deadlinePhrase: "on 1 December", deadlineDate: "2026-12-01" },
      { requestText: "It's due on 1 December" },
    );
    assert.equal(values.priority, "medium");
  });

  it("keeps critical when the request says so, and marks it as stated", () => {
    const { values, hints } = sanitize(
      { priority: "critical", priorityEvidence: "extremely urgent" },
      { requestText: "This is extremely urgent, please fix it" },
    );
    assert.equal(values.priority, "critical");
    assert.deepEqual(hints.priority, {
      source: "stated",
      evidence: "extremely urgent",
    });
  });

  it("doesn't accept evidence the request doesn't contain", () => {
    const { values, hints } = sanitize({
      priority: "critical",
      priorityEvidence: "extremely urgent",
    });
    assert.equal(values.priority, "medium");
    assert.equal(hints.priority?.source, "suggested");
  });

  it("leaves low alone", () => {
    assert.equal(sanitize({ priority: "low" }).values.priority, "low");
  });
});

describe("estimates and text", () => {
  it("marks an estimate as a suggestion by default", () => {
    const { values, hints } = sanitize({ estimatedMinutes: 45 });
    assert.equal(values.estimatedMinutes, "45");
    assert.equal(hints.estimatedMinutes?.source, "suggested");
  });

  it("marks a stated effort as stated", () => {
    const { hints } = sanitize(
      { estimatedMinutes: 120, estimateEvidence: "about two hours" },
      { requestText: "It takes about two hours" },
    );
    assert.equal(hints.estimatedMinutes?.source, "stated");
  });

  it("drops estimates that aren't whole positive numbers", () => {
    for (const estimatedMinutes of [0, -5, 1.5, 9_999_999]) {
      assert.equal(sanitize({ estimatedMinutes }).values.estimatedMinutes, "");
    }
  });

  it("falls back to the request when the title is blank", () => {
    assert.equal(sanitize({ title: "   " }).values.title, REQUEST);
  });

  it("uses only the first line of the request for a fallback title", () => {
    const { values } = sanitize({ title: "" }, { requestText: "First\nSecond" });
    assert.equal(values.title, "First");
  });

  it("clips text that's too long for the database", () => {
    const { values } = sanitize({
      title: "t".repeat(500),
      description: "d".repeat(6000),
      nextAction: "n".repeat(600),
    });
    assert.equal(values.title.length, 200);
    assert.equal(values.description.length, 5000);
    assert.equal(values.nextAction.length, 500);
  });

  it("always starts tasks as To do, and never fills in waiting for", () => {
    const { values } = sanitize({});
    assert.equal(values.status, "todo");
    assert.equal(values.waitingFor, "");
  });
});

describe("questions", () => {
  it("limits questions, removes duplicates and blanks", () => {
    const { questions } = sanitize(
      { questions: ["A?", "A?", " ", "B?", "C?", "D?"] },
      { requestText: "Emma asked", stakeholders: [EMMA] },
    );
    assert.equal(questions.length, 3);
    assert.equal(new Set(questions).size, 3);
  });

  it("doesn't ask about the workspace twice", () => {
    const { questions } = sanitize(
      { questions: ["What workspace is this in?"] },
      { requestText: "Please update the dashboard" },
    );
    assert.deepEqual(questions, ["Which workspace is this for?"]);
  });
});

describe("the prompt and output format", () => {
  const message = JSON.parse(
    buildExtractionUserMessage("Do the thing", {
      workspaces: [{ name: "GoMyCode" }],
      stakeholders: [{ name: "Nadia", role: null, workspaceName: "GoMyCode" }],
      projects: [],
      now: NOW,
      timeZone: ZONE,
    }),
  );

  it("gives real dates, in the user's zone, marking today", () => {
    assert.match(message.calendar, /2026-11-04 Wednesday \(today\)/);
    assert.match(message.calendar, /2026-11-05 Thursday \(tomorrow\)/);
  });

  it("keeps the request as data and sends no ids", () => {
    assert.equal(message.request, "Do the thing");
    assert.doesNotMatch(JSON.stringify(message), /"id"|workspaceId|ws-\d/);
  });

  it("states the rules the checks back up", () => {
    assert.match(EXTRACTION_SYSTEM_PROMPT, /Never invent a deadline/);
    assert.match(EXTRACTION_SYSTEM_PROMPT, /Never invent one/);
    assert.match(EXTRACTION_SYSTEM_PROMPT, /Never guess/);
    assert.match(EXTRACTION_SYSTEM_PROMPT, /ignore them/);
  });

  it("produces a strict schema with every field required", () => {
    const schema = extractionJsonSchema as {
      required: string[];
      properties: Record<string, unknown>;
      additionalProperties: boolean;
    };
    assert.equal(schema.additionalProperties, false);
    assert.deepEqual(
      [...schema.required].sort(),
      Object.keys(schema.properties).sort(),
    );
  });

  it("rejects a reply missing fields or with an invalid priority", () => {
    assert.equal(extractionOutputSchema.safeParse({ title: "x" }).success, false);
    assert.equal(
      extractionOutputSchema.safeParse(output({ priority: "urgent" as never })).success,
      false,
    );
  });
});
