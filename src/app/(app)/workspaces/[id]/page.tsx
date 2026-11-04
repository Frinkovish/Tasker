import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import {
  PageContainer,
  PageHeader,
  PhasePlaceholder,
  Section,
} from "@/components/common/page";
import { StatsStrip } from "@/components/dashboard/stats-strip";
import { Skeleton } from "@/components/ui/skeleton";
import { ProjectsSection } from "@/components/workspaces/projects-section";
import { StakeholdersSection } from "@/components/workspaces/stakeholders-section";
import { WorkspaceSettingsForm } from "@/components/workspaces/workspace-settings-form";
import { getTimeZone } from "@/lib/config";
import { buildDashboard } from "@/lib/dashboard/build-dashboard";
import { repository } from "@/lib/data";

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
  const { stats } = buildDashboard(
    tasks,
    [workspace],
    stakeholders,
    new Date(),
    getTimeZone(),
  );

  return (
    <>
      <PageHeader
        title={workspace.name}
        description={workspace.description || undefined}
      />
      <Section title="Overview">
        <StatsStrip stats={stats} />
      </Section>
      <Section title="Tasks">
        <PhasePlaceholder phase={3}>
          The task list for this workspace.
        </PhasePlaceholder>
      </Section>
      <Section title="Stakeholders">
        <StakeholdersSection workspaceId={id} stakeholders={stakeholders} />
      </Section>
      <Section title="Projects">
        <ProjectsSection workspaceId={id} projects={projects} />
      </Section>
      <Section title="Settings">
        <WorkspaceSettingsForm
          // A new key resets the form's defaults when the saved values change.
          key={workspace.updatedAt.getTime()}
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
