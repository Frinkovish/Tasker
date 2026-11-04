import type { Metadata } from "next";
import { Suspense } from "react";

import {
  PageContainer,
  PageHeader,
  Section,
} from "@/components/common/page";
import { PrioritiesList } from "@/components/dashboard/priorities-list";
import { RecentRequests } from "@/components/dashboard/recent-requests";
import { StatsStrip } from "@/components/dashboard/stats-strip";
import { WorkspaceFilter } from "@/components/dashboard/workspace-filter";
import { Skeleton } from "@/components/ui/skeleton";
import { getTimeZone } from "@/lib/config";
import { buildDashboard } from "@/lib/dashboard/build-dashboard";
import { repository } from "@/lib/data";
import { formatLongDate } from "@/lib/format";
import { parseWorkspaceScope } from "@/lib/workspaces/scope";

export const metadata: Metadata = { title: "Dashboard" };

export default function DashboardPage({
  searchParams,
}: PageProps<"/dashboard">) {
  return (
    <PageContainer>
      <Suspense fallback={<DashboardSkeleton />}>
        <DashboardContent searchParams={searchParams} />
      </Suspense>
    </PageContainer>
  );
}

async function DashboardContent({
  searchParams,
}: Pick<PageProps<"/dashboard">, "searchParams">) {
  const [{ workspace }, workspaces] = await Promise.all([
    searchParams,
    repository.listWorkspaces(),
  ]);
  const scope = parseWorkspaceScope(
    workspace,
    workspaces.map(({ id }) => id),
  );
  const [tasks, stakeholders] = await Promise.all([
    repository.listTasks(scope),
    repository.listStakeholders(scope),
  ]);

  const now = new Date();
  const timeZone = getTimeZone();
  const { stats, priorities, recentRequests } = buildDashboard(
    tasks,
    workspaces,
    stakeholders,
    now,
    timeZone,
  );

  return (
    <>
      <PageHeader
        title="Dashboard"
        description={formatLongDate(now, timeZone)}
      />
      <WorkspaceFilter workspaces={workspaces} scope={scope} />
      <StatsStrip stats={stats} />
      <div className="grid gap-8 lg:grid-cols-[3fr_2fr]">
        <Section
          title="Today's priorities"
          description="Ranked by deadline, then priority. Early preview of the Phase 5 engine."
        >
          <PrioritiesList items={priorities} />
        </Section>
        <Section title="Recent requests">
          <RecentRequests items={recentRequests} now={now} />
        </Section>
      </div>
    </>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-8" aria-hidden>
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-20 w-full" />
      <div className="grid gap-8 lg:grid-cols-[3fr_2fr]">
        <Skeleton className="h-64 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    </div>
  );
}
