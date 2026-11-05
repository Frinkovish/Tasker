import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import {
  PageContainer,
  EmptyState,
  PageHeader,
  Section,
} from "@/components/common/page";
import { StatsStrip } from "@/components/dashboard/stats-strip";
import { TaskList } from "@/components/tasks/task-list";
import { Skeleton } from "@/components/ui/skeleton";
import { ProjectsSection } from "@/components/workspaces/projects-section";
import { StakeholdersSection } from "@/components/workspaces/stakeholders-section";
import { WorkspaceSettingsForm } from "@/components/workspaces/workspace-settings-form";
import { getTimeZone } from "@/lib/config";
import { buildDashboard } from "@/lib/dashboard/build-dashboard";
import { repository } from "@/lib/data";
import { isActive } from "@/lib/tasks/deadlines";
import { buildTasksHref, sortTasks } from "@/lib/tasks/filters";
import { toTaskListItems } from "@/lib/tasks/list-items";

export const metadata: Metadata = { title: "Workspace" };

export default function WorkspacePage({
  params,
}: PageProps<"/workspaces/[id]">) {
  return (
    <PageContainer>
      <Suspense fallback={<Skeleton className="h-64 w-full" />}>
        <WorkspaceContent params={params} />
      </Suspense>
    </PageContainer>
  );
}

async function WorkspaceContent({
  params,
}: Pick<PageProps<"/workspaces/[id]">, "params">) {
  const { id } = await params;
  const workspace = await repository.getWorkspace(id);
  if (!workspace) notFound();

  const [tasks, stakeholders, projects] = await Promise.all([
    repository.listTasks(id),
    repository.listStakeholders(id),
    repository.listProjects(id),
  ]);
  const now = new Date();
  const timeZone = getTimeZone();
  const { stats } = buildDashboard(
    tasks,
    [workspace],
    stakeholders,
    now,
    timeZone,
  );
  const activeTasks = toTaskListItems(sortTasks(tasks.filter(isActive)), {
    workspaces: [workspace],
    stakeholders,
    projects,
    now,
    timeZone,
  });

  return (
    <>
      <PageHeader
        title={workspace.name}
        description={workspace.description || undefined}
      />
      <Section title="Overview">
        <StatsStrip stats={stats} workspaceId={id} />
      </Section>
      <Section title="Active tasks">
        {activeTasks.length > 0 ? (
          <TaskList items={activeTasks} />
        ) : (
          <EmptyState>No active tasks in this workspace.</EmptyState>
        )}
        <Link
          href={buildTasksHref({ status: "all" }, id)}
          className="inline-flex min-h-(--control-h-sm) items-center text-sm underline underline-offset-4"
        >
          All tasks in this workspace
        </Link>
      </Section>
      <Section title="Stakeholders">
        <StakeholdersSection workspaceId={id} stakeholders={stakeholders} />
      </Section>
      <Section title="Projects">
        <ProjectsSection workspaceId={id} projects={projects} />
      </Section>
      <Section title="Settings">
        <WorkspaceSettingsForm
          savedAt={workspace.updatedAt.getTime()}
          workspace={{
            id: workspace.id,
            name: workspace.name,
            description: workspace.description,
            color: workspace.color,
          }}
        />
      </Section>
    </>
  );
}
