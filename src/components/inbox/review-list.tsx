import { EmptyState } from "@/components/common/page";
import { WorkspaceTag } from "@/components/tasks/workspace-tag";
import { formatTimeAgo } from "@/lib/format";
import type { Task } from "@/lib/domain/task";
import type { Stakeholder, Workspace } from "@/lib/domain/workspace";

interface ReviewListProps {
  tasks: readonly Task[];
  workspaces: readonly Workspace[];
  stakeholders: readonly Stakeholder[];
  now: Date;
}

export function ReviewList({
  tasks,
  workspaces,
  stakeholders,
  now,
}: ReviewListProps) {
  if (tasks.length === 0) {
    return <EmptyState>Nothing waiting for review.</EmptyState>;
  }

  return (
    <ul className="divide-y rounded-lg border">
      {tasks.map((task) => {
        const workspace = workspaces.find(
          (item) => item.id === task.workspaceId,
        );
        const stakeholder = stakeholders.find(
          (item) => item.id === task.stakeholderId,
        );
        return (
          <li key={task.id} className="space-y-1 px-4 py-3">
            <p className="text-sm font-medium">{task.title}</p>
            <p className="line-clamp-2 text-sm text-muted-foreground">
              {task.sourceRequest}
            </p>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
              {workspace && <WorkspaceTag workspace={workspace} />}
              {stakeholder && <span>From {stakeholder.name}</span>}
              <span>{formatTimeAgo(task.createdAt, now)}</span>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
