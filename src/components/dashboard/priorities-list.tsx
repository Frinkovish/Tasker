import Link from "next/link";

import { EmptyState } from "@/components/common/page";
import { PriorityBadge } from "@/components/tasks/priority-badge";
import { WorkspaceTag } from "@/components/tasks/workspace-tag";
import type { PriorityItem } from "@/lib/dashboard/build-dashboard";

export function PrioritiesList({ items }: { items: readonly PriorityItem[] }) {
  if (items.length === 0) {
    return <EmptyState>Nothing pressing today.</EmptyState>;
  }

  return (
    <ol className="divide-y rounded-lg border">
      {items.map((item, index) => (
        <li key={item.id} className="relative flex gap-3 px-4 py-3 transition-colors hover:bg-muted/50">
          <span
            aria-hidden
            className="pt-px text-sm tabular-nums text-muted-foreground"
          >
            {index + 1}
          </span>
          <div className="min-w-0 flex-1 space-y-1">
            <div className="flex items-start justify-between gap-3">
              <Link
                href={`/tasks/${item.id}`}
                className="min-w-0 text-sm font-medium break-words outline-none after:absolute after:inset-0 focus-visible:after:ring-2 focus-visible:after:ring-ring focus-visible:after:ring-inset"
              >
                {item.title}
              </Link>
              <PriorityBadge priority={item.priority} />
            </div>
            <p className="text-xs text-muted-foreground">{item.reason}</p>
            <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
              {item.workspace && <WorkspaceTag workspace={item.workspace} />}
              {item.stakeholderName && (
                <span>From {item.stakeholderName}</span>
              )}
            </div>
          </div>
        </li>
      ))}
    </ol>
  );
}
