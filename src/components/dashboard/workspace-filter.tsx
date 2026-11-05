import Link from "next/link";

import { WorkspaceDot } from "@/components/tasks/workspace-tag";
import type { Workspace } from "@/lib/domain/workspace";
import { cn } from "@/lib/utils";
import {
  ALL_WORKSPACES,
  withScope,
  type WorkspaceScope,
} from "@/lib/workspaces/scope";

interface WorkspaceFilterProps {
  workspaces: readonly Workspace[];
  scope: WorkspaceScope;
}

/** Hidden on mobile, where the top bar's switcher does the same job. */
export function WorkspaceFilter({ workspaces, scope }: WorkspaceFilterProps) {
  const options = [
    { id: ALL_WORKSPACES, name: "All workspaces", color: null },
    ...workspaces,
  ];

  return (
    <nav
      aria-label="Filter by workspace"
      className="hidden max-w-full flex-wrap items-center gap-0.5 rounded-lg bg-muted p-0.5 md:inline-flex"
    >
      {options.map(({ id, name, color }) => {
        const isActive = id === scope;
        return (
          <Link
            key={id}
            href={withScope("/dashboard", id)}
            aria-current={isActive ? "true" : undefined}
            className={cn(
              "flex h-(--control-h-sm) max-w-full min-w-0 items-center gap-1.5 rounded-md px-2.5 text-xs text-foreground/75 outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring",
              isActive && "bg-background font-medium text-foreground shadow-xs",
            )}
          >
            {color && <WorkspaceDot color={color} />}
            <span className="truncate">{name}</span>
          </Link>
        );
      })}
    </nav>
  );
}
