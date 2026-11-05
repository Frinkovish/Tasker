import Link from "next/link";

import { CompleteToggle } from "@/components/tasks/complete-toggle";
import { PriorityBadge } from "@/components/tasks/priority-badge";
import { WorkspaceTag } from "@/components/tasks/workspace-tag";
import type { PlanItem } from "@/lib/prioritization/plan";
import { setTaskDone } from "@/lib/tasks/actions";

interface PlanListProps {
  items: readonly PlanItem[];
  /** Numbers the items, for lists where the order is the point. */
  numbered?: boolean;
}

export function PlanList({ items, numbered = false }: PlanListProps) {
  const List = numbered ? "ol" : "ul";

  return (
    <List className="divide-y rounded-lg border">
      {items.map((item, index) => (
        <li key={item.id} className="relative flex gap-3 px-4 py-3 transition-colors hover:bg-muted/50">
          <div className="pt-0.5">
            <CompleteToggle
              isDone={false}
              label={`Mark ${item.title} complete`}
              action={setTaskDone.bind(null, item.id, true)}
            />
          </div>
          {numbered && (
            <span
              aria-hidden
              className="pt-px text-sm tabular-nums text-muted-foreground"
            >
              {index + 1}
            </span>
          )}
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
            {item.reasons.length > 0 && (
              <p className="text-xs break-words text-foreground/80">
                {item.reasons.join(" · ")}
              </p>
            )}
            <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
              {item.workspace && <WorkspaceTag workspace={item.workspace} />}
              {item.stakeholderName && <span>From {item.stakeholderName}</span>}
            </div>
          </div>
        </li>
      ))}
    </List>
  );
}
