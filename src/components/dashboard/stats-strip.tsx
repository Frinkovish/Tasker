import type { DashboardStats } from "@/lib/dashboard/build-dashboard";
import { cn } from "@/lib/utils";

export function StatsStrip({ stats }: { stats: DashboardStats }) {
  const items = [
    { label: "Active", value: stats.active },
    {
      label: "Overdue",
      value: stats.overdue,
      valueClassName: stats.overdue > 0 ? "text-destructive" : undefined,
    },
    { label: "Due today", value: stats.dueToday },
    { label: "Next 7 days", value: stats.dueNext7Days },
    { label: "Waiting", value: stats.waiting },
  ];

  return (
    <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border bg-border sm:grid-cols-5">
      {items.map(({ label, value, valueClassName }, index) => (
        <div
          key={label}
          // The first item spans the row, so five items fill two columns evenly.
          className={cn(
            "bg-background px-4 py-3",
            index === 0 && "col-span-2 sm:col-span-1",
          )}
        >
          <dt className="text-xs text-muted-foreground">{label}</dt>
          <dd
            className={cn(
              "mt-0.5 text-2xl font-semibold tabular-nums tracking-tight",
              valueClassName,
            )}
          >
            {value}
          </dd>
        </div>
      ))}
    </dl>
  );
}
