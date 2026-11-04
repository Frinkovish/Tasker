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
        <li key={item.id} className="space-y-1 px-4 py-3">
          <p className="line-clamp-2 text-sm">{item.sourceRequest}</p>
          <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
            {item.workspace ? (
              <WorkspaceTag workspace={item.workspace} />
            ) : (
              <span />
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
