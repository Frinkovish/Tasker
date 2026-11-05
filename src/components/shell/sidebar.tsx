"use client";

import { Plus } from "lucide-react";
import Link from "next/link";

import { SignOutButton } from "@/components/auth/sign-out-button";
import { useCapture } from "@/components/capture/capture-provider";
import { WorkspaceDot } from "@/components/tasks/workspace-tag";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { withScope } from "@/lib/workspaces/scope";

import { Brand } from "./brand";
import { isNavItemActive, NAV_ITEMS } from "./navigation";
import type { WorkspaceOption } from "./types";
import { useWorkspaceScope } from "./use-workspace-scope";
import { WorkspaceSwitcher } from "./workspace-switcher";

const linkStyles =
  "flex h-9 items-center gap-2.5 rounded-md pointer-coarse:h-(--control-h) px-2.5 text-sm text-sidebar-foreground/80 outline-none transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 focus-visible:ring-sidebar-ring";
const activeLinkStyles =
  "bg-sidebar-accent font-medium text-sidebar-accent-foreground";

export function Sidebar({
  workspaces,
  email,
  inboxCount,
}: {
  workspaces: readonly WorkspaceOption[];
  email: string;
  inboxCount: number;
}) {
  const { pathname, scope } = useWorkspaceScope(workspaces);
  const { openQuickCapture, shortcutLabel } = useCapture();

  return (
    <aside className="sticky top-0 hidden h-dvh flex-col gap-4 overflow-y-auto border-r bg-sidebar p-3 md:flex">
      <div className="flex h-8 items-center px-1">
        <Brand />
      </div>

      <WorkspaceSwitcher workspaces={workspaces} className="w-full" />

      <Button onClick={openQuickCapture} className="w-full">
        <Plus aria-hidden />
        <span className="flex-1 text-left">Capture request</span>
        {shortcutLabel && (
          <kbd className="font-sans text-xs font-normal opacity-70">
            {shortcutLabel}
          </kbd>
        )}
      </Button>

      <nav aria-label="Main" className="flex flex-col gap-0.5">
        {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
          const isActive = isNavItemActive(pathname, href);
          return (
            <Link
              key={href}
              href={withScope(href, scope)}
              aria-current={isActive ? "page" : undefined}
              className={cn(linkStyles, isActive && activeLinkStyles)}
            >
              <Icon className="size-4" aria-hidden />
              <span className="flex-1">{label}</span>
              {href === "/inbox" && inboxCount > 0 && (
                <span className="text-xs tabular-nums text-muted-foreground">
                  <span className="sr-only">To review: </span>
                  {inboxCount}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      <nav aria-label="Workspaces" className="flex flex-col gap-0.5">
        <h2 className="px-2.5 pb-1 text-xs font-medium text-muted-foreground">
          Workspaces
        </h2>
        {workspaces.map((workspace) => {
          const href = `/workspaces/${workspace.id}`;
          const isActive = isNavItemActive(pathname, href);
          return (
            <Link
              key={workspace.id}
              href={href}
              aria-current={isActive ? "page" : undefined}
              className={cn(linkStyles, isActive && activeLinkStyles)}
            >
              <WorkspaceDot color={workspace.color} />
              <span className="truncate">{workspace.name}</span>
            </Link>
          );
        })}
      </nav>

      <div className="mt-auto flex items-center justify-between gap-2 border-t pt-3">
        <span className="min-w-0 truncate px-1 text-xs text-muted-foreground">
          {email}
        </span>
        <SignOutButton />
      </div>
    </aside>
  );
}
