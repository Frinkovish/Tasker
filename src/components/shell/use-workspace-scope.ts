"use client";

import { usePathname, useSearchParams } from "next/navigation";

import { resolveActiveScope, SCOPE_PARAM } from "@/lib/workspaces/scope";

import type { WorkspaceOption } from "./types";

export function useWorkspaceScope(workspaces: readonly WorkspaceOption[]) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const scope = resolveActiveScope(
    pathname,
    searchParams.get(SCOPE_PARAM),
    workspaces.map((workspace) => workspace.id),
  );
  return { pathname, scope };
}
