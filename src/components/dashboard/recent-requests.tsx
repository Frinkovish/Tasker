import Link from "next/link";

import { EmptyState } from "@/components/common/page";
import { WorkspaceTag } from "@/components/tasks/workspace-tag";
import type { RecentRequest } from "@/lib/dashboard/build-dashboard";
import { formatTimeAgo } from "@/lib/format";

interface RecentRequestsProps {
  items: readonly RecentRequest[];
  now: Date;
}

export function RecentRequests({ items, now }: RecentRequestsProps) {
  if (items.length === 0) {
    return <EmptyState>No requests yet.</EmptyState>;
  }

  return (
    <ul className="divide-y rounded-lg border">
      {items.map((item) => (
        <li key={item.id} className="relative space-y-1 px-4 py-3 transition-colors hover:bg-muted/50">
          <Link
            href={item.href}
            className="line-clamp-2 text-sm break-words outline-none after:absolute after:inset-0 focus-visible:after:ring-2 focus-visible:after:ring-ring focus-visible:after:ring-inset"
          >
            {item.sourceRequest}
          </Link>
          <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
            {item.workspace ? (
              <WorkspaceTag workspace={item.workspace} />
            ) : (
              <span>Not reviewed</span>
            )}
            <span className="shrink-0">
              {formatTimeAgo(item.createdAt, now)}
            </span>
          </div>
        </li>
      ))}
    </ul>
  );
}
