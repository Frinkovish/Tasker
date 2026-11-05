import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { PageContainer, PageHeader, Section } from "@/components/common/page";
import { CompleteToggle } from "@/components/tasks/complete-toggle";
import { NotesSection } from "@/components/tasks/notes-section";
import { PriorityBadge } from "@/components/tasks/priority-badge";
import { SubtasksSection } from "@/components/tasks/subtasks-section";
import { TaskEditForm } from "@/components/tasks/task-edit-form";
import { WorkspaceTag } from "@/components/tasks/workspace-tag";
import { Skeleton } from "@/components/ui/skeleton";
import { getTimeZone } from "@/lib/config";
import { repository } from "@/lib/data";
import { TASK_STATUS_LABELS } from "@/lib/domain/task";
import { formatDateTime } from "@/lib/format";
import { setTaskDone } from "@/lib/tasks/actions";
import { describeActivity } from "@/lib/tasks/activity";
import { formatDeadlineInput } from "@/lib/tasks/deadlines";

export const metadata: Metadata = { title: "Task" };

export default function TaskPage({ params }: PageProps<"/tasks/[id]">) {
  return (
    <PageContainer>
      <Link
        href="/tasks"
        className="inline-flex min-h-(--control-h-sm) items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" aria-hidden />
        Tasks
      </Link>
      <Suspense fallback={<Skeleton className="h-96 w-full" />}>
        <TaskContent params={params} />
      </Suspense>
    </PageContainer>
  );
}

async function TaskContent({
  params,
}: Pick<PageProps<"/tasks/[id]">, "params">) {
  const { id } = await params;
  const task = await repository.getTask(id);
  if (!task) notFound();

  const [workspace, stakeholders, projects, subtasks, notes, activity] =
    await Promise.all([
      repository.getWorkspace(task.workspaceId),
      // Only this task's workspace: a task can't reference another one.
      repository.listStakeholders(task.workspaceId),
      repository.listProjects(task.workspaceId),
      repository.listSubtasks(id),
      repository.listNotes(id),
      repository.listActivity(id),
    ]);

  const timeZone = getTimeZone();
  const deadline = formatDeadlineInput(task.deadline, timeZone);
  const isDone = task.status === "done";

  return (
    <>
      <div className="flex items-start gap-3">
        <div className="pt-1.5">
          <CompleteToggle
            isDone={isDone}
            label={isDone ? `Reopen ${task.title}` : `Mark ${task.title} complete`}
            action={setTaskDone.bind(null, id, !isDone)}
          />
        </div>
        <div className="min-w-0 flex-1 space-y-2">
          <PageHeader title={task.title} />
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
            {workspace && <WorkspaceTag workspace={workspace} />}
            <span>{TASK_STATUS_LABELS[task.status]}</span>
            <PriorityBadge priority={task.priority} />
          </div>
        </div>
      </div>

      <Section title="Original request">
        <blockquote className="rounded-lg border-l-2 bg-muted/50 px-4 py-3 text-sm break-words whitespace-pre-wrap">
          {task.sourceRequest}
        </blockquote>
      </Section>

      <Section title="Details">
        <TaskEditForm
          savedAt={task.updatedAt.getTime()}
          taskId={id}
          stakeholders={stakeholders.map(({ id, name }) => ({ id, name }))}
          projects={projects.map(({ id, name }) => ({ id, name }))}
          values={{
            title: task.title,
            description: task.description ?? "",
            stakeholderId: task.stakeholderId ?? "",
            projectId: task.projectId ?? "",
            status: task.status,
            priority: task.priority,
            deadlineDate: deadline.date,
            deadlineTime: deadline.time,
            estimatedMinutes: task.estimatedMinutes?.toString() ?? "",
            nextAction: task.nextAction ?? "",
            waitingFor: task.waitingFor ?? "",
          }}
        />
      </Section>

      <Section title="Subtasks">
        <SubtasksSection taskId={id} subtasks={subtasks} />
      </Section>

      <Section title="Notes">
        <NotesSection
          taskId={id}
          notes={notes.map((note) => ({
            id: note.id,
            body: note.body,
            createdAtLabel: formatDateTime(note.createdAt, timeZone),
          }))}
        />
      </Section>

      <Section title="History">
        <ol className="divide-y rounded-lg border">
          {activity.map((entry) => (
            <li key={entry.id} className="space-y-0.5 px-4 py-2">
              {describeActivity(entry, { stakeholders, projects, timeZone }).map(
                (line) => (
                  <p key={line} className="text-sm break-words">
                    {line}
                  </p>
                ),
              )}
              <p className="text-xs text-muted-foreground">
                {formatDateTime(entry.createdAt, timeZone)}
              </p>
            </li>
          ))}
        </ol>
      </Section>
    </>
  );
}
