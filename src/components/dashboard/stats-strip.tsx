import Link from "next/link";

import type { DashboardStats } from "@/lib/dashboard/build-dashboard";
import { buildTasksHref } from "@/lib/tasks/filters";
import { cn } from "@/lib/utils";

interface StatsStripProps {
  stats: DashboardStats;
  /** Keeps links within one workspace; null means all workspaces. */
  workspaceId: string | null;
}

export function StatsStrip({ stats, workspaceId }: StatsStripProps) {
  const items = [
    { label: "Active", value: stats.active, filters: {} },
    {
      label: "Overdue",
      value: stats.overdue,
      filters: { deadline: "overdue" },
      valueClassName: stats.overdue > 0 ? "text-destructive" : undefined,
    },
    {
      label: "Due today",
      value: stats.dueToday,
      filters: { deadline: "today" },
    },
    {
      label: "Next 7 days",
      value: stats.dueNext7Days,
      filters: { deadline: "next7Days" },
    },
    { label: "Waiting", value: stats.waiting, filters: { status: "waiting" } },
  ] as const;

  return (
    <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border bg-border sm:grid-cols-5">
      {items.map((item, index) => (
        <div
          key={item.label}
          // The first item spans the row, so five items fill two columns evenly.
          className={cn(
            "relative bg-background px-4 py-3 transition-colors hover:bg-muted/50",
            index === 0 && "col-span-2 sm:col-span-1",
          )}
        >
          <dt className="text-xs text-muted-foreground">{item.label}</dt>
          <dd
            className={cn(
              "mt-0.5 text-2xl font-semibold tabular-nums tracking-tight",
              "valueClassName" in item && item.valueClassName,
            )}
          >
            {/* The link stretches over the whole cell. */}
            <Link
              href={buildTasksHref(item.filters, workspaceId)}
              aria-label={`${item.label}: ${item.value}. View these tasks`}
              className="outline-none after:absolute after:inset-0 focus-visible:after:ring-2 focus-visible:after:ring-ring focus-visible:after:ring-inset"
            >
              {item.value}
            </Link>
          </dd>
        </div>
      ))}
    </dl>
  );
}
