import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { DeleteButton } from "@/components/common/delete-button";
import {
  EmptyState,
  PageContainer,
  PageHeader,
  Section,
} from "@/components/common/page";
import { InboxCapture } from "@/components/inbox/inbox-capture";
import { TaskList } from "@/components/tasks/task-list";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { getTimeZone } from "@/lib/config";
import { deleteCapture } from "@/lib/captures/actions";
import { repository } from "@/lib/data";
import { formatTimeAgo } from "@/lib/format";
import { sortTasks } from "@/lib/tasks/filters";
import { toTaskListItems } from "@/lib/tasks/list-items";
import { parseWorkspaceScope } from "@/lib/workspaces/scope";

export const metadata: Metadata = { title: "Inbox" };

export default function InboxPage({ searchParams }: PageProps<"/inbox">) {
  return (
    <PageContainer>
      <PageHeader
        title="Inbox"
        description="Capture a request in your own words. It stays here until you review it and choose a workspace."
      />
      <InboxCapture />
      <Suspense fallback={<Skeleton className="h-48 w-full" />}>
        <InboxContent searchParams={searchParams} />
      </Suspense>
    </PageContainer>
  );
}

async function InboxContent({
  searchParams,
}: Pick<PageProps<"/inbox">, "searchParams">) {
  const [{ workspace }, workspaces, captures] = await Promise.all([
    searchParams,
    repository.listWorkspaces(),
    repository.listCaptures(),
  ]);
  const scope = parseWorkspaceScope(
    workspace,
    workspaces.map(({ id }) => id),
  );
  const [tasks, stakeholders, projects] = await Promise.all([
    repository.listTasks(scope),
    repository.listStakeholders(scope),
    repository.listProjects(scope),
  ]);

  const now = new Date();
  const inboxTasks = toTaskListItems(
    sortTasks(tasks.filter((task) => task.status === "inbox")),
    { workspaces, stakeholders, projects, now, timeZone: getTimeZone() },
  );

  return (
    <>
      <Section
        title="To review"
        description="These aren't tasks yet, so they aren't tied to a workspace."
      >
        {captures.length === 0 ? (
          <EmptyState>Nothing to review.</EmptyState>
        ) : (
          <ul className="divide-y rounded-lg border">
            {captures.map((capture) => (
              <li
                key={capture.id}
                className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2 px-4 py-3"
              >
                <div className="min-w-0 flex-1 basis-60 space-y-1">
                  <p className="text-sm break-words whitespace-pre-wrap">
                    {capture.sourceText}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {formatTimeAgo(capture.createdAt, now)}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <Button asChild size="sm">
                    <Link href={`/inbox/${capture.id}`}>Review</Link>
                  </Button>
                  <DeleteButton
                    label="Discard this request"
                    confirmation="Discard this request? It can't be recovered."
                    action={deleteCapture.bind(null, capture.id)}
                  />
                </div>
              </li>
            ))}
          </ul>
        )}
      </Section>

      {inboxTasks.length > 0 && (
        <Section
          title="Tasks with Inbox status"
          description="Saved to a workspace, but not started or planned yet."
        >
          <TaskList items={inboxTasks} />
        </Section>
      )}
    </>
  );
}
