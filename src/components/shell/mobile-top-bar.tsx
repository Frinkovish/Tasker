"use client";

import { Compass } from "lucide-react";

import { SignOutButton } from "@/components/auth/sign-out-button";

import type { WorkspaceOption } from "./types";
import { WorkspaceSwitcher } from "./workspace-switcher";

export function MobileTopBar({
  workspaces,
}: {
  workspaces: readonly WorkspaceOption[];
}) {
  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b bg-background px-4 md:hidden">
      <span
        role="img"
        aria-label="WorkPilot"
        className="flex size-7 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground"
      >
        <Compass className="size-4" aria-hidden />
      </span>
      <WorkspaceSwitcher workspaces={workspaces} className="min-w-0 flex-1" />
      <SignOutButton />
    </header>
  );
}
