"use client";

import { Plus } from "lucide-react";
import Link from "next/link";

import { useCapture } from "@/components/capture/capture-provider";
import { cn } from "@/lib/utils";
import { withScope } from "@/lib/workspaces/scope";

import { isNavItemActive, NAV_ITEMS, type NavItem } from "./navigation";
import type { WorkspaceOption } from "./types";
import { useWorkspaceScope } from "./use-workspace-scope";

export function MobileTabBar({
  workspaces,
}: {
  workspaces: readonly WorkspaceOption[];
}) {
  const { pathname, scope } = useWorkspaceScope(workspaces);
  const { openQuickCapture } = useCapture();

  const renderTab = ({ href, label, icon: Icon }: NavItem) => {
    const isActive = isNavItemActive(pathname, href);
    return (
      <Link
        key={href}
        href={withScope(href, scope)}
        aria-current={isActive ? "page" : undefined}
        className={cn(
          "flex min-w-0 flex-col items-center justify-center gap-0.5 text-[11px] text-muted-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
          isActive && "font-medium text-foreground",
        )}
      >
        <Icon className="size-5" aria-hidden />
        <span className="max-w-full truncate">{label}</span>
      </Link>
    );
  };

  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-30 border-t bg-background pb-[env(safe-area-inset-bottom)] md:hidden"
    >
      <div className="grid h-16 grid-cols-5">
        {NAV_ITEMS.slice(0, 2).map(renderTab)}
        <div className="flex items-center justify-center">
          <button
            type="button"
            onClick={openQuickCapture}
            aria-label="Capture request"
            className="flex size-11 items-center justify-center rounded-full bg-primary text-primary-foreground outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            <Plus className="size-5" aria-hidden />
          </button>
        </div>
        {NAV_ITEMS.slice(2).map(renderTab)}
      </div>
    </nav>
  );
}
