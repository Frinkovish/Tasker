import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import {
  EmptyState,
  PageContainer,
  PageHeader,
  Section,
} from "@/components/common/page";
import { PlanList } from "@/components/plan/plan-list";
import { TimePicker } from "@/components/plan/time-picker";
import { Skeleton } from "@/components/ui/skeleton";
import { getTimeZone } from "@/lib/config";
import { repository } from "@/lib/data";
import { formatLongDate, formatMinutes } from "@/lib/format";
import { RANKING_RULES } from "@/lib/prioritization/engine";
import {
  buildDailyPlan,
  parseAvailableMinutes,
  type TimeBudget,
} from "@/lib/prioritization/plan";
import { ALL_WORKSPACES, parseWorkspaceScope } from "@/lib/workspaces/scope";

export const metadata: Metadata = { title: "Today" };

export default function PlanPage({ searchParams }: PageProps<"/plan">) {
  return (
    <PageContainer>
      <Suspense fallback={<PlanSkeleton />}>
        <PlanContent searchParams={searchParams} />
      </Suspense>
    </PageContainer>
  );
}

function timeSummary({
  availableMinutes,
  plannedMinutes,
  unestimatedCount,
}: TimeBudget): string {
  const summary = `Planned ${formatMinutes(plannedMinutes)} of your ${formatMinutes(availableMinutes)}.`;
  if (unestimatedCount === 0) return summary;
  return unestimatedCount === 1
    ? `${summary} 1 task has no estimate, so it may take longer.`
    : `${summary} ${unestimatedCount} tasks have no estimate, so it may take longer.`;
}

async function PlanContent({
  searchParams,
}: Pick<PageProps<"/plan">, "searchParams">) {
  const [params, workspaces, captures] = await Promise.all([
    searchParams,
    repository.listWorkspaces(),
    repository.listCaptures(),
  ]);
  const scope = parseWorkspaceScope(
    params.workspace,
    workspaces.map(({ id }) => id),
  );
  const [tasks, stakeholders] = await Promise.all([
    repository.listTasks(scope),
    repository.listStakeholders(scope),
  ]);

  const now = new Date();
  const timeZone = getTimeZone();
  const minutes = parseAvailableMinutes(params.minutes);
  const plan = buildDailyPlan(tasks, {
    workspaces,
    stakeholders,
    now,
    timeZone,
    availableMinutes: minutes,
  });

  return (
    <>
      <PageHeader title="Today" description={formatLongDate(now, timeZone)} />
      <TimePicker
        minutes={minutes}
        workspaceId={scope === ALL_WORKSPACES ? null : scope}
      />

      {captures.length > 0 && (
        <Link
          href="/inbox"
          className="block rounded-lg border px-4 py-2.5 text-sm hover:bg-muted/50"
        >
          {captures.length === 1
            ? "1 request isn't in this plan yet, because it's waiting for review"
            : `${captures.length} requests aren't in this plan yet, because they're waiting for review`}
        </Link>
      )}

      <Section
        title="Most important"
        description={plan.time ? timeSummary(plan.time) : undefined}
      >
        {plan.topThree.length > 0 ? (
          <PlanList items={plan.topThree} numbered />
        ) : (
          <EmptyState>Nothing pressing today.</EmptyState>
        )}
      </Section>

      {plan.alsoToday.length > 0 && (
        <Section title="Also due today">
          <PlanList items={plan.alsoToday} />
        </Section>
      )}

      {plan.alsoFits.length > 0 && (
        <Section title="If you have time left">
          <PlanList items={plan.alsoFits} />
        </Section>
      )}

      {plan.doesNotFit.length > 0 && (
        <Section
          title="Won't fit in your time"
          description="Important, but too long for the time you have. Consider making more time or splitting them up."
        >
          <PlanList items={plan.doesNotFit} />
        </Section>
      )}

      {plan.atRisk.length > 0 && (
        <Section title="At risk of missing their deadline">
          <PlanList items={plan.atRisk} />
        </Section>
      )}

      {plan.followUps.length > 0 && (
        <Section title="Follow up" description="Waiting on someone else.">
          <PlanList items={plan.followUps} />
        </Section>
      )}

      <details className="rounded-lg border text-sm">
        <summary className="cursor-pointer px-4 py-3 font-medium">
          How tasks are ranked
        </summary>
        <p className="px-4 text-xs text-muted-foreground">
          Each task earns points from these rules, and the highest score comes
          first. Your working hours aren&apos;t assumed.
        </p>
        <dl className="mt-3 space-y-1.5 px-4 pb-3 text-xs">
          {RANKING_RULES.map(({ label, points }) => (
            <div key={label} className="flex flex-wrap justify-between gap-x-4">
              <dt>{label}</dt>
              <dd className="text-muted-foreground">{points}</dd>
            </div>
          ))}
        </dl>
      </details>
    </>
  );
}

function PlanSkeleton() {
  return (
    <div className="space-y-6" aria-hidden>
      <Skeleton className="h-8 w-40" />
      <Skeleton className="h-16 w-full" />
      <Skeleton className="h-64 w-full" />
    </div>
  );
}
