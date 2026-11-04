"use client";

import { ChevronsUpDown, Layers } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { WorkspaceDot } from "@/components/tasks/workspace-tag";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ALL_WORKSPACES, hrefForScope } from "@/lib/workspaces/scope";

import type { WorkspaceOption } from "./types";
import { useWorkspaceScope } from "./use-workspace-scope";

interface WorkspaceSwitcherProps {
  workspaces: readonly WorkspaceOption[];
  className?: string;
}

export function WorkspaceSwitcher({
  workspaces,
  className,
}: WorkspaceSwitcherProps) {
  const router = useRouter();
  const { pathname, scope } = useWorkspaceScope(workspaces);
  const active = workspaces.find((workspace) => workspace.id === scope);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          className={className}
          aria-label={`Workspace: ${active?.name ?? "All workspaces"}`}
        >
          {active ? (
            <WorkspaceDot color={active.color} />
          ) : (
            <Layers aria-hidden className="text-muted-foreground" />
          )}
          <span className="min-w-0 flex-1 truncate text-left">
            {active?.name ?? "All workspaces"}
          </span>
          <ChevronsUpDown aria-hidden className="text-muted-foreground" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        <DropdownMenuLabel>Show work from</DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={scope}
          onValueChange={(value) => router.push(hrefForScope(pathname, value))}
        >
          <DropdownMenuRadioItem value={ALL_WORKSPACES}>
            <Layers aria-hidden className="text-muted-foreground" />
            All workspaces
          </DropdownMenuRadioItem>
          {workspaces.map((workspace) => (
            <DropdownMenuRadioItem key={workspace.id} value={workspace.id}>
              <WorkspaceDot color={workspace.color} />
              <span className="truncate">{workspace.name}</span>
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
        {active && pathname !== `/workspaces/${active.id}` && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link href={`/workspaces/${active.id}`}>
                <span className="truncate">Open {active.name}</span>
              </Link>
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
