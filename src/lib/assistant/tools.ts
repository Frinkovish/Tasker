import { z } from "zod";

// Relative imports with extensions let Node's test runner load this file.
import {
  TASK_CHANGE_FIELDS,
  type NewProposal,
  type ProposalPayload,
} from "../domain/assistant.ts";
import {
  subtaskInputSchema,
  taskNoteInputSchema,
  TASK_PRIORITIES,
  TASK_STATUSES,
  type Subtask,
  type Task,
  type TaskNote,
} from "../domain/task.ts";
import { DEADLINE_FILTERS } from "../tasks/filters.ts";

import { buildTaskUpdateProposal, describeProposal } from "./proposals.ts";
import {
  describeTask,
  findTasks,
  getDailyPlan,
  getForgottenWork,
  getWorkload,
  listPeopleAndProjects,
  type ReadContext,
} from "./read-tools.ts";

/** A task's subtasks and notes are read one task at a time, when they're asked for. */
export interface TaskExtrasLoader {
  (taskId: string): Promise<{ subtasks: Subtask[]; notes: TaskNote[] }>;
}

export interface ToolDefinition {
  type: "function";
  function: {
    name: string;
    description: string;
    strict: true;
    parameters: unknown;
  };
}

/** More than this in one reply is a sign something has gone wrong. */
const MAX_PROPOSALS_PER_TURN = 5;

/** When the user's own message clearly covers several tasks, a broad search is fine. */
const ASKS_FOR_SEVERAL = /\b(all|both|every|each|tous|toutes|chaque)\b|\bles deux\b/iu;

function createArgumentSchemas(workspaceIds: readonly string[]) {
  // Limited to the user's real workspaces, so the model can't name another one.
  const workspaceId = z.enum(workspaceIds as [string, ...string[]]).nullable();
  const workspaceOnly = z.object({ workspace_id: workspaceId });

  return {
    get_daily_plan: z.object({
      workspace_id: workspaceId,
      available_minutes: z.number().int().min(1).max(1440).nullable(),
    }),
    find_tasks: z.object({
      workspace_id: workspaceId,
      status: z.enum(["active", "all", ...TASK_STATUSES]),
      deadline: z.enum(DEADLINE_FILTERS).nullable(),
      priority: z.enum(TASK_PRIORITIES).nullable(),
      person: z.string().nullable(),
      project: z.string().nullable(),
      text: z.string().nullable(),
    }),
    get_task: z.object({ task_id: z.string() }),
    get_workload: z.object({}),
    get_forgotten_work: workspaceOnly,
    list_people_and_projects: workspaceOnly,
    propose_task_change: z.object({
      task_id: z.string(),
      changes: z.array(
        z.object({
          field: z.enum(TASK_CHANGE_FIELDS),
          value: z.string().nullable(),
        }),
      ),
    }),
    propose_note: z.object({ task_id: z.string(), body: z.string() }),
    propose_subtask: z.object({ task_id: z.string(), title: z.string() }),
  };
}

type ToolName = keyof ReturnType<typeof createArgumentSchemas>;

const TOOL_DESCRIPTIONS: Record<ToolName, string> = {
  get_daily_plan:
    "The ranked plan for today, with the app's reason for every task. Use for what to work on, what to prioritize, and how to spend a stated amount of time. Set available_minutes only when the user states their time.",
  find_tasks:
    "Searches tasks. Status 'active' means open tasks, 'waiting' means tasks waiting on someone, and 'all' includes finished ones. deadline 'overdue' finds overdue tasks. person matches a stakeholder or a name in the request, and also returns unreviewed requests that mention them. Use status 'all' when asked what someone requested.",
  get_task:
    "One task in full: original request, description, subtasks and notes.",
  get_workload:
    "Counts and total estimates for each workspace. Use to compare workload between jobs.",
  get_forgotten_work:
    "What's easy to lose track of: unreviewed requests, overdue work, tasks at risk, follow-ups gone quiet, and undated tasks left untouched.",
  list_people_and_projects: "The stakeholders and projects in each workspace.",
  propose_task_change:
    "Prepares a change to one task for the user to confirm. It changes nothing by itself. Only call this when the user's words point to exactly one task. If your search found several they could mean, ask which one instead of calling this. Fields: title, deadline (YYYY-MM-DD or YYYY-MM-DD HH:mm, or null to remove it), status (inbox, todo, in_progress, waiting, done, cancelled), priority (critical, high, medium, low), estimatedMinutes (whole minutes as text, or null), nextAction, waitingFor (null to clear them).",
  propose_note:
    "Prepares a note on a task for the user to confirm. It changes nothing by itself.",
  propose_subtask:
    "Prepares a subtask on a task for the user to confirm. It changes nothing by itself.",
};

export function createToolDefinitions(
  workspaceIds: readonly string[],
): ToolDefinition[] {
  return Object.entries(createArgumentSchemas(workspaceIds)).map(
    ([name, schema]) => ({
      type: "function",
      function: {
        name,
        description: TOOL_DESCRIPTIONS[name as ToolName],
        strict: true,
        parameters: z.toJSONSchema(schema, { target: "draft-7" }),
      },
    }),
  );
}

export interface ToolRunner {
  /** Always returns text for the model. A bad call is something it can correct. */
  run(name: string, rawArguments: string): Promise<string>;
  /** Everything prepared this turn, for the user to confirm. */
  readonly proposals: readonly NewProposal[];
}

const errorResult = (message: string) => JSON.stringify({ error: message });

/**
 * Runs what the model asks for. Reading is limited to the records in the snapshot,
 * which only holds the user's own data. Writing isn't possible from here: a propose
 * tool only records a proposal, and nothing is applied until the user confirms it.
 */
export function createToolRunner(
  context: ReadContext,
  loadTaskExtras: TaskExtrasLoader,
  userMessage: string,
): ToolRunner {
  const { snapshot, now, timeZone } = context;
  const schemas = createArgumentSchemas(snapshot.workspaces.map(({ id }) => id));
  const proposals: NewProposal[] = [];
  let lastSearchMatches: readonly { id: string; title: string }[] = [];

  const findTask = (id: string): Task | undefined =>
    snapshot.tasks.find((task) => task.id === id);

  const propose = (task: Task, payload: ProposalPayload): string => {
    proposals.push({ taskId: task.id, payload });
    const workspace = snapshot.workspaces.find(
      ({ id }) => id === task.workspaceId,
    );
    return JSON.stringify({
      status: "awaiting_user_confirmation",
      note: "Nothing has changed. The user now sees this under your reply, with buttons to confirm or dismiss it.",
      task: task.title,
      workspace: workspace?.name ?? null,
      changes: describeProposal(payload, now, timeZone),
    });
  };

  const checkCanPropose = (id: string): Task | string => {
    const task = findTask(id);
    if (!task) return "No task has that id. Find the task first.";
    // Enforced here because the model, told only to ask, still guessed most of the time.
    if (
      lastSearchMatches.length > 1 &&
      lastSearchMatches.some((match) => match.id === id) &&
      !ASKS_FOR_SEVERAL.test(userMessage)
    ) {
      const titles = lastSearchMatches.map(({ title }) => `"${title}"`).join(", ");
      return `Not prepared, because your last search matched ${lastSearchMatches.length} tasks: ${titles}. If the user's own words pick out one, search again using those words. Otherwise list them and ask which one the user means, and tell them nothing has been prepared.`;
    }
    if (proposals.length >= MAX_PROPOSALS_PER_TURN) {
      return `Only ${MAX_PROPOSALS_PER_TURN} changes can be prepared at once. Tell the user the rest will have to follow.`;
    }
    if (proposals.some(({ taskId, payload }) => taskId === id && payload.kind === "update_task")) {
      return "A change to this task is already prepared in this reply.";
    }
    return task;
  };

  async function execute(name: ToolName, args: unknown): Promise<string> {
    switch (name) {
      case "get_daily_plan":
        return JSON.stringify(
          getDailyPlan(schemas.get_daily_plan.parse(args), context),
        );
      case "find_tasks": {
        const result = findTasks(schemas.find_tasks.parse(args), context);
        lastSearchMatches = result.tasks;
        return JSON.stringify(result);
      }
      case "get_task": {
        const task = findTask(schemas.get_task.parse(args).task_id);
        if (!task) return errorResult("No task has that id.");
        const { subtasks, notes } = await loadTaskExtras(task.id);
        return JSON.stringify(describeTask(task, subtasks, notes, context));
      }
      case "get_workload":
        return JSON.stringify(getWorkload(context));
      case "get_forgotten_work":
        return JSON.stringify(
          getForgottenWork(schemas.get_forgotten_work.parse(args), context),
        );
      case "list_people_and_projects":
        return JSON.stringify(
          listPeopleAndProjects(
            schemas.list_people_and_projects.parse(args),
            context,
          ),
        );
      case "propose_task_change": {
        const { task_id: id, changes } = schemas.propose_task_change.parse(args);
        const task = checkCanPropose(id);
        if (typeof task === "string") return errorResult(task);
        const result = buildTaskUpdateProposal(task, changes, timeZone);
        return result.ok
          ? propose(task, { kind: "update_task", changes: result.changes })
          : errorResult(result.message);
      }
      case "propose_note": {
        const { task_id: id, body } = schemas.propose_note.parse(args);
        const task = checkCanPropose(id);
        if (typeof task === "string") return errorResult(task);
        const input = taskNoteInputSchema.safeParse({ body });
        return input.success
          ? propose(task, { kind: "add_note", body: input.data.body })
          : errorResult(input.error.issues[0].message);
      }
      case "propose_subtask": {
        const { task_id: id, title } = schemas.propose_subtask.parse(args);
        const task = checkCanPropose(id);
        if (typeof task === "string") return errorResult(task);
        const input = subtaskInputSchema.safeParse({ title });
        return input.success
          ? propose(task, { kind: "add_subtask", title: input.data.title })
          : errorResult(input.error.issues[0].message);
      }
    }
  }

  return {
    proposals,
    async run(name, rawArguments) {
      if (!Object.hasOwn(schemas, name)) {
        return errorResult(`There's no tool called ${name}.`);
      }
      let args: unknown;
      try {
        args = JSON.parse(rawArguments);
      } catch {
        return errorResult("Those arguments weren't valid JSON.");
      }
      try {
        return await execute(name as ToolName, args);
      } catch (error) {
        // Only bad arguments go back to the model. A database failure must end the
        // turn, or the model could report "nothing found" when it simply failed.
        if (error instanceof z.ZodError) {
          return errorResult(`Invalid arguments: ${error.issues[0].message}`);
        }
        throw error;
      }
    },
  };
}
