// Relative imports with extensions let Node's test runner load this file.
import type { Capture } from "../domain/capture.ts";
import {
  TASK_PRIORITY_LABELS,
  TASK_STATUS_LABELS,
  type Subtask,
  type Task,
  type TaskNote,
} from "../domain/task.ts";
import type { Project, Stakeholder, Workspace } from "../domain/workspace.ts";
import { formatMinutes } from "../format.ts";
import { assessDeadlineRisk, RANKING_RULES } from "../prioritization/engine.ts";
import { buildDailyPlan, type PlanItem } from "../prioritization/plan.ts";
import {
  calendarDaysFromNow,
  formatDeadline,
  formatDeadlineMoment,
  getDeadlineBucket,
  isActive,
  isAwaitingResponse,
} from "../tasks/deadlines.ts";
import {
  filterTasks,
  sortTasks,
  type StatusFilter,
} from "../tasks/filters.ts";
import { appearsIn } from "../text.ts";

/*
 * What the model can read. Everything is computed here from real records, so counts,
 * dates and reasons come from the app rather than from the model. Contact details
 * aren't included in anything, because no question needs them.
 */

export interface AssistantSnapshot {
  workspaces: readonly Workspace[];
  stakeholders: readonly Stakeholder[];
  projects: readonly Project[];
  tasks: readonly Task[];
  captures: readonly Capture[];
}

export interface ReadContext {
  snapshot: AssistantSnapshot;
  now: Date;
  timeZone: string;
}

const LIST_LIMIT = 25;
const SECTION_LIMIT = 10;
const EXCERPT_LENGTH = 300;
const QUIET_FOLLOW_UP_DAYS = 3;
const QUIET_TASK_DAYS = 7;

const excerpt = (text: string) =>
  text.length > EXCERPT_LENGTH ? `${text.slice(0, EXCERPT_LENGTH)}…` : text;

const inWorkspace = (tasks: readonly Task[], workspaceId: string | null) =>
  workspaceId === null
    ? tasks
    : tasks.filter((task) => task.workspaceId === workspaceId);

function summarizeTask(
  task: Task,
  { snapshot, now, timeZone }: ReadContext,
  options: { includeRequest?: boolean } = {},
) {
  const { workspaces, stakeholders, projects } = snapshot;
  return {
    id: task.id,
    title: task.title,
    workspace: workspaces.find(({ id }) => id === task.workspaceId)?.name ?? null,
    status: TASK_STATUS_LABELS[task.status],
    priority: TASK_PRIORITY_LABELS[task.priority],
    deadline: task.deadline ? formatDeadlineMoment(task.deadline, timeZone) : null,
    deadline_status: task.deadline
      ? formatDeadline(task.deadline, now, timeZone)
      : "No deadline",
    stakeholder:
      stakeholders.find(({ id }) => id === task.stakeholderId)?.name ?? null,
    project: projects.find(({ id }) => id === task.projectId)?.name ?? null,
    estimate: task.estimatedMinutes ? formatMinutes(task.estimatedMinutes) : null,
    next_action: task.nextAction,
    waiting_for: task.waitingFor,
    ...(options.includeRequest
      ? { original_request: excerpt(task.sourceRequest) }
      : {}),
  };
}

const summarizeCapture = ({ id, sourceText, createdAt }: Capture, now: Date) => ({
  id,
  text: excerpt(sourceText),
  days_waiting: Math.floor((now.getTime() - createdAt.getTime()) / 86_400_000),
});

export interface FindTasksArgs {
  workspace_id: string | null;
  status: StatusFilter;
  deadline: "overdue" | "today" | "next7Days" | "later" | "none" | null;
  priority: Task["priority"] | null;
  person: string | null;
  project: string | null;
  text: string | null;
}

export function findTasks(args: FindTasksArgs, context: ReadContext) {
  const { snapshot, now, timeZone } = context;
  const { stakeholders, projects } = snapshot;
  const person = args.person?.trim() || null;
  const projectName = args.project?.trim() || null;
  const text = args.text?.trim() || null;

  const peopleIds = new Set(
    stakeholders
      .filter(({ name }) => person && appearsIn(name, person))
      .map(({ id }) => id),
  );
  const projectIds = new Set(
    projects
      .filter(({ name }) => projectName && appearsIn(name, projectName))
      .map(({ id }) => id),
  );

  const matches = sortTasks(
    filterTasks(
      inWorkspace(snapshot.tasks, args.workspace_id),
      {
        query: text ?? "",
        status: args.status,
        priority: args.priority,
        stakeholderId: null,
        projectId: null,
        deadline: args.deadline,
      },
      { stakeholders, projects, now, timeZone },
    ),
  )
    // A person can be named in a request or awaited without being linked to the task.
    .filter(
      (task) =>
        !person ||
        (task.stakeholderId !== null && peopleIds.has(task.stakeholderId)) ||
        appearsIn(task.sourceRequest, person) ||
        appearsIn(task.waitingFor ?? "", person),
    )
    .filter(
      (task) =>
        !projectName ||
        (task.projectId !== null && projectIds.has(task.projectId)),
    );

  const words = [person, text].filter((word): word is string => word !== null);
  return {
    total: matches.length,
    showing: Math.min(matches.length, LIST_LIMIT),
    tasks: matches.slice(0, LIST_LIMIT).map((task) =>
      // The original wording is only sent when the question is about what was asked.
      summarizeTask(task, context, { includeRequest: words.length > 0 }),
    ),
    // Not tasks yet, but a request from someone shouldn't be missed because of that.
    unreviewed_requests:
      words.length === 0
        ? []
        : snapshot.captures
            .filter(({ sourceText }) =>
              words.every((word) =>
                word
                  .split(/\s+/)
                  .every((part) => appearsIn(sourceText, part)),
              ),
            )
            .map((capture) => summarizeCapture(capture, now)),
    ...(person && peopleIds.size === 0
      ? { note: `No stakeholder is called "${person}", so only task text was searched.` }
      : {}),
    ...(projectName && projectIds.size === 0
      ? { note: `No project is called "${projectName}".` }
      : {}),
  };
}

const summarizePlanItem = ({
  id,
  title,
  priority,
  workspace,
  stakeholderName,
  reasons,
}: PlanItem) => ({
  id,
  title,
  priority: TASK_PRIORITY_LABELS[priority],
  workspace: workspace?.name ?? null,
  stakeholder: stakeholderName,
  reasons,
});

export function getDailyPlan(
  args: { workspace_id: string | null; available_minutes: number | null },
  { snapshot, now, timeZone }: ReadContext,
) {
  const plan = buildDailyPlan(inWorkspace(snapshot.tasks, args.workspace_id), {
    workspaces: snapshot.workspaces,
    stakeholders: snapshot.stakeholders,
    now,
    timeZone,
    availableMinutes: args.available_minutes,
  });
  return {
    most_important: plan.topThree.map(summarizePlanItem),
    also_due_today: plan.alsoToday.map(summarizePlanItem),
    also_fits_in_the_time: plan.alsoFits.map(summarizePlanItem),
    does_not_fit_in_the_time: plan.doesNotFit.map(summarizePlanItem),
    at_risk_of_missing_deadline: plan.atRisk.map(summarizePlanItem),
    follow_up: plan.followUps.map(summarizePlanItem),
    time: plan.time && {
      available: formatMinutes(plan.time.availableMinutes),
      planned: formatMinutes(plan.time.plannedMinutes),
      recommended_tasks_with_no_estimate: plan.time.unestimatedCount,
    },
    unreviewed_requests: snapshot.captures.length,
    ranking_rules: RANKING_RULES.map(
      ({ label, points }) => `${label}: ${points}`,
    ),
  };
}

export function getWorkload({ snapshot, now, timeZone }: ReadContext) {
  return {
    workspaces: snapshot.workspaces.map(({ id, name }) => {
      const open = snapshot.tasks.filter(
        (task) => task.workspaceId === id && isActive(task),
      );
      const inBucket = (bucket: string) =>
        open.filter(
          ({ deadline }) => getDeadlineBucket(deadline, now, timeZone) === bucket,
        ).length;
      const estimated = open.reduce(
        (total, task) => total + (task.estimatedMinutes ?? 0),
        0,
      );
      return {
        workspace: name,
        open_tasks: open.length,
        overdue: inBucket("overdue"),
        due_today: inBucket("today"),
        due_next_7_days: inBucket("next7Days"),
        no_deadline: inBucket("none"),
        waiting_on_someone: open.filter(isAwaitingResponse).length,
        critical_or_high_priority: open.filter(
          ({ priority }) => priority === "critical" || priority === "high",
        ).length,
        total_estimate: formatMinutes(estimated),
        tasks_with_no_estimate: open.filter(
          ({ estimatedMinutes }) => estimatedMinutes === null,
        ).length,
      };
    }),
    unreviewed_requests_not_in_any_workspace: snapshot.captures.length,
  };
}

function limitSection<Item>(items: readonly Item[]) {
  return {
    total: items.length,
    items: items.slice(0, SECTION_LIMIT),
  };
}

/** Each task appears once, under the most pressing thing about it. */
export function getForgottenWork(
  args: { workspace_id: string | null },
  context: ReadContext,
) {
  const { snapshot, now, timeZone } = context;
  const open = sortTasks(
    inWorkspace(snapshot.tasks, args.workspace_id).filter(isActive),
  );
  const quietDays = (task: Task) =>
    -calendarDaysFromNow(task.updatedAt, now, timeZone);

  const listed = new Set<string>();
  const take = (matches: (task: Task) => boolean) =>
    open.filter((task) => {
      if (listed.has(task.id) || !matches(task)) return false;
      listed.add(task.id);
      return true;
    });
  const summarize = (extra: (task: Task) => Record<string, unknown>) => (task: Task) => ({
    ...summarizeTask(task, context),
    ...extra(task),
  });

  const overdue = take(
    ({ deadline }) => getDeadlineBucket(deadline, now, timeZone) === "overdue",
  );
  const atRisk = take((task) => assessDeadlineRisk(task, now, timeZone) !== null);
  const quietFollowUps = take(
    (task) => isAwaitingResponse(task) && quietDays(task) >= QUIET_FOLLOW_UP_DAYS,
  );
  const quietNoDeadline = take(
    (task) => task.deadline === null && quietDays(task) >= QUIET_TASK_DAYS,
  );

  return {
    unreviewed_requests: limitSection(
      snapshot.captures.map((capture) => summarizeCapture(capture, now)),
    ),
    overdue: limitSection(overdue.map(summarize(() => ({})))),
    at_risk_of_missing_deadline: limitSection(
      atRisk.map(
        summarize((task) => ({ risk: assessDeadlineRisk(task, now, timeZone) })),
      ),
    ),
    follow_ups_gone_quiet: limitSection(
      quietFollowUps.map(summarize((task) => ({ days_unchanged: quietDays(task) }))),
    ),
    no_deadline_and_untouched: limitSection(
      quietNoDeadline.map(summarize((task) => ({ days_unchanged: quietDays(task) }))),
    ),
  };
}

export function listPeopleAndProjects(
  args: { workspace_id: string | null },
  { snapshot }: ReadContext,
) {
  return {
    workspaces: snapshot.workspaces
      .filter(({ id }) => args.workspace_id === null || id === args.workspace_id)
      .map(({ id, name }) => ({
        workspace: name,
        stakeholders: snapshot.stakeholders
          .filter(({ workspaceId }) => workspaceId === id)
          .map(({ name: person, role }) => ({ name: person, role })),
        projects: snapshot.projects
          .filter(({ workspaceId }) => workspaceId === id)
          .map(({ name: project, description, status }) => ({
            name: project,
            description,
            status,
          })),
      })),
  };
}

export function describeTask(
  task: Task,
  subtasks: readonly Subtask[],
  notes: readonly TaskNote[],
  context: ReadContext,
) {
  const { timeZone } = context;
  return {
    ...summarizeTask(task, context),
    original_request: task.sourceRequest,
    description: task.description,
    created: formatDeadlineMoment(task.createdAt, timeZone),
    last_changed: formatDeadlineMoment(task.updatedAt, timeZone),
    completed: task.completedAt
      ? formatDeadlineMoment(task.completedAt, timeZone)
      : null,
    subtasks: subtasks.map(({ title, status }) => ({ title, status })),
    notes: notes.map(({ body, createdAt }) => ({
      body,
      written: formatDeadlineMoment(createdAt, timeZone),
    })),
  };
}
