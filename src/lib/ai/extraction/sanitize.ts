// Relative imports with extensions let Node's test runner load this file.
import type { TaskPriority } from "../../domain/task.ts";
import {
  calendarDaysFromNow,
  parseDeadlineInput,
} from "../../tasks/deadlines.ts";
import { appearsIn, normalizeText as normalize } from "../../text.ts";

import type { ExtractionOutput } from "./schema.ts";

/*
 * The model is told the rules, but this is what enforces them. Nothing it returns
 * reaches the form unless it can be checked against the request's own words and
 * the user's real data. When something doesn't hold up it's dropped, and a
 * question is asked if the user needs to know.
 */

/** "stated" came from the user's words. "suggested" is the AI's judgement. */
export type FieldSource = "stated" | "suggested";

export interface FieldHint {
  source: FieldSource;
  /** The words from the request this came from. */
  evidence: string | null;
}

export interface SuggestedValues {
  workspaceId: string;
  title: string;
  description: string;
  stakeholderId: string;
  projectId: string;
  status: string;
  priority: string;
  deadlineDate: string;
  deadlineTime: string;
  estimatedMinutes: string;
  nextAction: string;
  waitingFor: string;
}

export interface Extraction {
  values: SuggestedValues;
  hints: Partial<Record<keyof SuggestedValues, FieldHint>>;
  /** Questions the user should answer before saving. */
  questions: string[];
  /** Things worth knowing that don't need an answer. */
  notes: string[];
}

interface Named {
  id: string;
  name: string;
}
interface InWorkspace extends Named {
  workspaceId: string;
}

export interface SanitizeContext {
  requestText: string;
  workspaces: readonly Named[];
  stakeholders: readonly InWorkspace[];
  projects: readonly InWorkspace[];
  now: Date;
  timeZone: string;
}

const MAX_QUESTIONS = 3;
const TITLE_MAX = 200;
const DESCRIPTION_MAX = 5000;
const NEXT_ACTION_MAX = 500;
const ESTIMATE_MAX = 999_999;
const HIGH_PRIORITY_WITHOUT_EVIDENCE_DAYS = 7;

/**
 * Finds saved items for a name in the request. An exact match wins, otherwise the
 * words can be part of a longer name: "Emma" finds "Emma Jones".
 */
function findByName<Item extends Named>(
  items: readonly Item[],
  mention: string,
): Item[] {
  const wanted = normalize(mention);
  const exact = items.filter((item) => normalize(item.name) === wanted);
  if (exact.length > 0) return exact;

  const words = wanted.split(" ");
  return items.filter((item) => {
    const nameWords = normalize(item.name).split(" ");
    return words.every((word) => nameWords.includes(word));
  });
}

const WEEKDAY_NUMBERS: Record<string, number> = {
  sunday: 0,
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
  dimanche: 0,
  lundi: 1,
  mardi: 2,
  mercredi: 3,
  jeudi: 4,
  vendredi: 5,
  samedi: 6,
};
const RELATIVE_DAYS: Record<string, number> = {
  today: 0,
  tomorrow: 1,
  "aujourd'hui": 0,
  demain: 1,
};

/** Catches the model pairing the user's words with the wrong date. */
function dateContradictsPhrase(
  phrase: string,
  date: string,
  deadline: Date,
  now: Date,
  timeZone: string,
): boolean {
  const [year, month, day] = date.split("-").map(Number);
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();

  for (const [word, number] of Object.entries(WEEKDAY_NUMBERS)) {
    if (appearsIn(phrase, word) && number !== weekday) return true;
  }
  for (const [word, offset] of Object.entries(RELATIVE_DAYS)) {
    if (
      appearsIn(phrase, word) &&
      calendarDaysFromNow(deadline, now, timeZone) !== offset
    ) {
      return true;
    }
  }
  return false;
}

/** Only keep a time if the user's words contain one, so none gets made up. */
const phraseStatesTime = (phrase: string) =>
  /\d|\b(noon|midnight|midi|minuit)\b/i.test(phrase);

function resolveDeadline(output: ExtractionOutput, context: SanitizeContext) {
  const { requestText, now, timeZone } = context;
  const phrase = output.deadlinePhrase;
  const none = { date: "", time: "", evidence: null, questions: [], notes: [] };

  // No quote from the request means no deadline, whatever date came back.
  if (!phrase || !appearsIn(requestText, phrase)) return none;

  if (!output.deadlineDate) {
    return {
      ...none,
      questions: [`Your request says "${phrase}". What date should that be?`],
    };
  }

  const time =
    output.deadlineTime && phraseStatesTime(phrase) ? output.deadlineTime : "";
  const parsed = parseDeadlineInput(output.deadlineDate, time, timeZone);
  if (!parsed.ok || !parsed.deadline) {
    return {
      ...none,
      questions: [`Your request says "${phrase}". What date should that be?`],
    };
  }

  if (
    dateContradictsPhrase(phrase, output.deadlineDate, parsed.deadline, now, timeZone)
  ) {
    return {
      ...none,
      questions: [`Your request says "${phrase}". What date should that be?`],
    };
  }

  const isPast = calendarDaysFromNow(parsed.deadline, now, timeZone) < 0;
  return {
    date: output.deadlineDate,
    time,
    evidence: phrase,
    questions: [],
    notes: isPast ? [`The deadline "${phrase}" has already passed.`] : [],
  };
}

interface WorkspaceDecision {
  workspace: Named | null;
  hint?: FieldHint;
  questions: string[];
}

const workspacesOf = (items: readonly InWorkspace[]) =>
  new Set(items.map((item) => item.workspaceId));

/**
 * Decides the workspace, leaning towards asking: a request is never put in a
 * workspace unless something real points there and nothing points elsewhere.
 */
function resolveWorkspace(
  output: ExtractionOutput,
  stakeholders: readonly InWorkspace[],
  projects: readonly InWorkspace[],
  context: SanitizeContext,
): WorkspaceDecision {
  const { requestText, workspaces } = context;
  const proposed = output.workspaceName
    ? findByName(workspaces, output.workspaceName)
    : [];
  const candidate = proposed.length === 1 ? proposed[0] : null;

  // The request names the workspace outright, which beats everything else.
  if (candidate && appearsIn(requestText, candidate.name)) {
    return {
      workspace: candidate,
      hint: { source: "stated", evidence: candidate.name },
      questions: [],
    };
  }

  // Which workspaces the named people and projects could belong to.
  const sets = [stakeholders, projects]
    .filter((items) => items.length > 0)
    .map(workspacesOf);
  const possible =
    sets.length === 0
      ? null
      : [...sets[0]].filter((id) => sets.every((set) => set.has(id)));

  if (possible !== null && possible.length === 0) {
    return {
      workspace: null,
      questions: [
        "The people and projects you mentioned are in different workspaces. Which one is this for?",
      ],
    };
  }

  // Beyond the workspace's own name, only saved people and projects count. The
  // topic of the work isn't enough: both jobs could have a "dashboard".
  if (candidate && possible && !possible.includes(candidate.id)) {
    return {
      workspace: null,
      questions: [
        "The people or projects you mentioned point to a different workspace than the rest of the request. Which one is this for?",
      ],
    };
  }

  // A stakeholder or project in exactly one workspace identifies it.
  if (possible?.length === 1) {
    const workspace = workspaces.find(({ id }) => id === possible[0]) ?? null;
    if (workspace) {
      return {
        workspace,
        hint: {
          source: "suggested",
          evidence: output.stakeholderName ?? output.projectName,
        },
        questions: [],
      };
    }
  }

  return { workspace: null, questions: ["Which workspace is this for?"] };
}

function resolveRelation(
  mention: string | null,
  matches: readonly InWorkspace[],
  workspaceId: string | null,
  kind: "stakeholder" | "project",
  workspaceName: string | null,
) {
  const none = { id: "", hint: undefined, questions: [], notes: [] };
  if (!mention) return none;

  if (matches.length === 0) {
    return {
      ...none,
      notes: [
        `"${mention}" isn't saved as a ${kind} yet, so it wasn't filled in. You can add it on the workspace page.`,
      ],
    };
  }
  if (!workspaceId) return none;

  const inWorkspace = matches.filter((item) => item.workspaceId === workspaceId);
  if (inWorkspace.length === 1) {
    return {
      ...none,
      id: inWorkspace[0].id,
      hint: { source: "stated" as const, evidence: mention },
    };
  }
  if (inWorkspace.length > 1) {
    return {
      ...none,
      questions: [`More than one ${kind} matches "${mention}". Which one do you mean?`],
    };
  }
  return {
    ...none,
    notes: [`"${mention}" isn't a ${kind} in ${workspaceName}, so it wasn't filled in.`],
  };
}

/**
 * High priority has to be earned. Without the request's own words, "critical" is
 * capped at high, and "high" needs a deadline that's actually close.
 */
function resolvePriority(
  output: ExtractionOutput,
  deadlineDate: string,
  context: SanitizeContext,
): { value: TaskPriority; hint: FieldHint } {
  const { requestText, now, timeZone } = context;
  if (appearsIn(requestText, output.priorityEvidence)) {
    return {
      value: output.priority,
      hint: { source: "stated", evidence: output.priorityEvidence },
    };
  }

  const parsed = deadlineDate
    ? parseDeadlineInput(deadlineDate, "", timeZone)
    : null;
  const hasCloseDeadline =
    parsed?.ok === true &&
    parsed.deadline !== null &&
    calendarDaysFromNow(parsed.deadline, now, timeZone) <=
      HIGH_PRIORITY_WITHOUT_EVIDENCE_DAYS;

  let value = output.priority;
  if (value === "critical") value = "high";
  if (value === "high" && !hasCloseDeadline) value = "medium";
  return { value, hint: { source: "suggested", evidence: null } };
}

function resolveEstimate(output: ExtractionOutput, requestText: string) {
  const minutes = output.estimatedMinutes;
  if (
    minutes === null ||
    !Number.isInteger(minutes) ||
    minutes <= 0 ||
    minutes > ESTIMATE_MAX
  ) {
    return { value: "", hint: undefined };
  }
  return {
    value: String(minutes),
    hint: appearsIn(requestText, output.estimateEvidence)
      ? { source: "stated" as const, evidence: output.estimateEvidence }
      : { source: "suggested" as const, evidence: null },
  };
}

const clip = (text: string | null, max: number) =>
  (text ?? "").trim().slice(0, max);

/** The first line of the request, so a title is never left blank. */
function fallbackTitle(requestText: string): string {
  return clip(requestText.split("\n")[0], TITLE_MAX);
}

/** Turns the model's proposal into what the review form may actually show. */
export function sanitizeExtraction(
  output: ExtractionOutput,
  context: SanitizeContext,
): Extraction {
  const { requestText, workspaces } = context;

  // Names are only believed if the request really contains them.
  const stakeholderMention = appearsIn(requestText, output.stakeholderName)
    ? output.stakeholderName
    : null;
  const projectMention = appearsIn(requestText, output.projectName)
    ? output.projectName
    : null;

  const stakeholderMatches = stakeholderMention
    ? findByName(context.stakeholders, stakeholderMention)
    : [];
  const projectMatches = projectMention
    ? findByName(context.projects, projectMention)
    : [];

  const decision = resolveWorkspace(
    { ...output, stakeholderName: stakeholderMention, projectName: projectMention },
    stakeholderMatches,
    projectMatches,
    context,
  );
  const workspaceId = decision.workspace?.id ?? null;
  const workspaceName =
    workspaces.find(({ id }) => id === workspaceId)?.name ?? null;

  const stakeholder = resolveRelation(
    stakeholderMention,
    stakeholderMatches,
    workspaceId,
    "stakeholder",
    workspaceName,
  );
  const project = resolveRelation(
    projectMention,
    projectMatches,
    workspaceId,
    "project",
    workspaceName,
  );
  const deadline = resolveDeadline(output, context);
  const priority = resolvePriority(output, deadline.date, context);
  const estimate = resolveEstimate(output, requestText);

  const title = clip(output.title, TITLE_MAX) || fallbackTitle(requestText);
  const description = clip(output.description, DESCRIPTION_MAX);
  const nextAction = clip(output.nextAction, NEXT_ACTION_MAX);

  const SUGGESTED: FieldHint = { source: "suggested", evidence: null };
  const hints: Extraction["hints"] = {
    title: SUGGESTED,
    priority: priority.hint,
  };
  if (description) hints.description = SUGGESTED;
  if (nextAction) hints.nextAction = SUGGESTED;
  if (decision.hint) hints.workspaceId = decision.hint;
  if (stakeholder.hint) hints.stakeholderId = stakeholder.hint;
  if (project.hint) hints.projectId = project.hint;
  if (estimate.hint) hints.estimatedMinutes = estimate.hint;
  if (deadline.date) {
    hints.deadlineDate = { source: "stated", evidence: deadline.evidence };
  }

  // The checks' own questions come first; they're about things found to be wrong.
  const ownQuestions: string[] = [
    ...decision.questions,
    ...deadline.questions,
    ...stakeholder.questions,
    ...project.questions,
  ];
  const modelQuestions = output.questions
    .map((question) => question.trim())
    .filter(Boolean)
    // Already covered above, when the workspace or deadline is the open question.
    .filter(
      (question) =>
        !(
          workspaceId === null &&
          (/workspace/i.test(question) ||
            workspaces.some(({ name }) => appearsIn(question, name)))
        ),
    )
    .filter((question) => !(deadline.questions.length > 0 && /deadline|when|date/i.test(question)));
  const questions = [...new Set([...ownQuestions, ...modelQuestions])].slice(
    0,
    MAX_QUESTIONS,
  );

  return {
    values: {
      workspaceId: workspaceId ?? "",
      title,
      description,
      stakeholderId: stakeholder.id,
      projectId: project.id,
      status: "todo",
      priority: priority.value,
      deadlineDate: deadline.date,
      deadlineTime: deadline.time,
      estimatedMinutes: estimate.value,
      nextAction,
      waitingFor: "",
    },
    hints,
    questions,
    notes: [...deadline.notes, ...stakeholder.notes, ...project.notes],
  };
}
