import type { Metadata } from "next";
import Link from "next/link";
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
import { buildPlanHref } from "@/lib/prioritization/plan";
import { ALL_WORKSPACES, parseWorkspaceScope } from "@/lib/workspaces/scope";

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
  const [{ workspace }, workspaces, captures] = await Promise.all([
    searchParams,
    repository.listWorkspaces(),
    repository.listCaptures(),
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
  const isAllWorkspaces = scope === ALL_WORKSPACES;
  const { stats, priorities, recentRequests } = buildDashboard(
    tasks,
    workspaces,
    stakeholders,
    now,
    timeZone,
    // Captures have no workspace yet, so they only fit the all-workspaces view.
    isAllWorkspaces ? captures : [],
  );

  return (
    <>
      <PageHeader
        title="Dashboard"
        description={formatLongDate(now, timeZone)}
      />
      <WorkspaceFilter workspaces={workspaces} scope={scope} />
      <StatsStrip stats={stats} workspaceId={isAllWorkspaces ? null : scope} />
      {captures.length > 0 && (
        <Link
          href="/inbox"
          className="block rounded-lg border px-4 py-2.5 text-sm hover:bg-muted/50"
        >
          {captures.length === 1
            ? "1 request is waiting for review"
            : `${captures.length} requests are waiting for review`}
        </Link>
      )}
      <div className="grid gap-8 lg:grid-cols-[3fr_2fr]">
        <Section
          title="Today's priorities"
          description="The three most important tasks, and why."
        >
          <PrioritiesList items={priorities} />
          <Link
            href={buildPlanHref(null, isAllWorkspaces ? null : scope)}
            className="inline-flex min-h-(--control-h-sm) items-center text-sm underline underline-offset-4"
          >
            Open today&apos;s full plan
          </Link>
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
