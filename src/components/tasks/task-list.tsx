import Link from "next/link";

import { TASK_STATUS_LABELS } from "@/lib/domain/task";
import { setTaskDone } from "@/lib/tasks/actions";
import type { TaskListItem } from "@/lib/tasks/list-items";
import { cn } from "@/lib/utils";

import { CompleteToggle } from "./complete-toggle";
import { PriorityBadge } from "./priority-badge";
import { WorkspaceTag } from "./workspace-tag";

export function TaskList({ items }: { items: readonly TaskListItem[] }) {
  return (
    <ul className="divide-y rounded-lg border">
      {items.map((item) => (
        <li key={item.id} className="relative flex gap-3 px-4 py-3 transition-colors hover:bg-muted/50">
          <div className="pt-0.5">
            <CompleteToggle
              isDone={item.isDone}
              label={
                item.isDone
                  ? `Reopen ${item.title}`
                  : `Mark ${item.title} complete`
              }
              action={setTaskDone.bind(null, item.id, !item.isDone)}
            />
          </div>
          <div className="min-w-0 flex-1 space-y-1">
            <div className="flex items-start justify-between gap-3">
              <Link
                href={`/tasks/${item.id}`}
                className={cn(
                  "min-w-0 text-sm font-medium break-words outline-none after:absolute after:inset-0 focus-visible:after:ring-2 focus-visible:after:ring-ring focus-visible:after:ring-inset",
                  item.isClosed && "text-muted-foreground line-through",
                )}
              >
                {item.title}
              </Link>
              <PriorityBadge priority={item.priority} />
            </div>
            <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
              {item.workspace && <WorkspaceTag workspace={item.workspace} />}
              <span>{TASK_STATUS_LABELS[item.status]}</span>
              {item.deadlineLabel && (
                <span
                  className={cn(item.isOverdue && "font-medium text-destructive")}
                >
                  {item.deadlineLabel}
                </span>
              )}
              {item.stakeholderName && <span>From {item.stakeholderName}</span>}
              {item.projectName && <span>{item.projectName}</span>}
              {item.waitingFor && <span>Waiting for {item.waitingFor}</span>}
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}
