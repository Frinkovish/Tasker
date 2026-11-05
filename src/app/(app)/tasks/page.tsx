import type { Metadata } from "next";
import { Suspense } from "react";

import {
  EmptyState,
  PageContainer,
  PageHeader,
} from "@/components/common/page";
import { TaskFilterBar } from "@/components/tasks/task-filter-bar";
import { TaskList } from "@/components/tasks/task-list";
import { Skeleton } from "@/components/ui/skeleton";
import { getTimeZone } from "@/lib/config";
import { repository } from "@/lib/data";
import {
  filterTasks,
  parseTaskFilters,
  sortTasks,
} from "@/lib/tasks/filters";
import { toTaskListItems } from "@/lib/tasks/list-items";
import { ALL_WORKSPACES, parseWorkspaceScope } from "@/lib/workspaces/scope";

export const metadata: Metadata = { title: "Tasks" };

export default function TasksPage({ searchParams }: PageProps<"/tasks">) {
  return (
    <PageContainer>
      <Suspense fallback={<TasksSkeleton />}>
        <TasksContent searchParams={searchParams} />
      </Suspense>
    </PageContainer>
  );
}

async function TasksContent({
  searchParams,
}: Pick<PageProps<"/tasks">, "searchParams">) {
  const [params, workspaces] = await Promise.all([
    searchParams,
    repository.listWorkspaces(),
  ]);
  const scope = parseWorkspaceScope(
    params.workspace,
    workspaces.map(({ id }) => id),
  );
  const [tasks, stakeholders, projects] = await Promise.all([
    repository.listTasks(scope),
    repository.listStakeholders(scope),
    repository.listProjects(scope),
  ]);

  const filters = parseTaskFilters(params, {
    stakeholderIds: stakeholders.map(({ id }) => id),
    projectIds: projects.map(({ id }) => id),
  });
  const now = new Date();
  const timeZone = getTimeZone();
  const context = { stakeholders, projects, now, timeZone };
  const items = toTaskListItems(sortTasks(filterTasks(tasks, filters, context)), {
    ...context,
    workspaces,
  });

  // Names can repeat across workspaces, so say which one when both are showing.
  const withWorkspace = <Item extends { name: string; workspaceId: string }>(
    item: Item,
  ) => {
    const workspace = workspaces.find(({ id }) => id === item.workspaceId);
    return scope === ALL_WORKSPACES && workspace
      ? `${item.name} (${workspace.name})`
      : item.name;
  };

  return (
    <>
      <PageHeader
        title="Tasks"
        description={`${items.length} ${items.length === 1 ? "task" : "tasks"}`}
      />
      <TaskFilterBar
        filters={filters}
        scope={scope}
        workspaces={workspaces.map(({ id, name }) => ({ id, name }))}
        stakeholders={stakeholders.map((item) => ({
          id: item.id,
          name: withWorkspace(item),
        }))}
        projects={projects.map((item) => ({
          id: item.id,
          name: withWorkspace(item),
        }))}
      />
      {items.length > 0 ? (
        <TaskList items={items} />
      ) : (
        <EmptyState>
          {tasks.length > 0
            ? "No tasks match these filters."
            : "No tasks yet. Capture a request, then review it in your inbox."}
        </EmptyState>
      )}
    </>
  );
}

function TasksSkeleton() {
  return (
    <div className="space-y-6" aria-hidden>
      <Skeleton className="h-8 w-40" />
      <Skeleton className="h-8 w-full" />
      <Skeleton className="h-64 w-full" />
    </div>
  );
}
