import { cache, Suspense, type ReactNode } from "react";

import { CaptureProvider } from "@/components/capture/capture-provider";
import { QuickCaptureDialog } from "@/components/capture/quick-capture-dialog";
import { getCurrentUser } from "@/lib/auth/session";
import { repository } from "@/lib/data";

import { MobileTabBar } from "./mobile-tab-bar";
import { MobileTopBar } from "./mobile-top-bar";
import {
  MobileTabBarFallback,
  MobileTopBarFallback,
  SidebarFallback,
} from "./shell-fallback";
import { Sidebar } from "./sidebar";
import type { WorkspaceOption } from "./types";

/** Shared by the three navigation pieces, so one request fetches this once. */
const getWorkspaceOptions = cache(async (): Promise<WorkspaceOption[]> => {
  const workspaces = await repository.listWorkspaces();
  return workspaces.map(({ id, name, color }) => ({ id, name, color }));
});

async function SidebarSlot() {
  const [workspaces, user] = await Promise.all([
    getWorkspaceOptions(),
    getCurrentUser(),
  ]);
  return <Sidebar workspaces={workspaces} email={user.email} />;
}

async function MobileTopBarSlot() {
  return <MobileTopBar workspaces={await getWorkspaceOptions()} />;
}

async function MobileTabBarSlot() {
  return <MobileTabBar workspaces={await getWorkspaceOptions()} />;
}

/**
 * Navigation reads the URL's workspace scope, so each piece has its own
 * Suspense boundary. <main> stays outside them, which keeps page content in
 * the initial HTML instead of waiting for the navigation.
 */
export function AppShell({ children }: { children: ReactNode }) {
  return (
    <CaptureProvider>
      {/*
        One top-level element: an open dialog marks the document's other top-level
        elements as hidden, and that must not land on navigation still streaming
        in, or it would fail to hydrate.
      */}
      <div>
        <div className="min-h-dvh md:grid md:grid-cols-[15rem_minmax(0,1fr)]">
          <Suspense fallback={<SidebarFallback />}>
            <SidebarSlot />
          </Suspense>
          <div className="flex min-w-0 flex-col">
            <Suspense fallback={<MobileTopBarFallback />}>
              <MobileTopBarSlot />
            </Suspense>
            {/* The bottom padding keeps content clear of the mobile tab bar. */}
            <main className="flex-1 pb-[calc(5rem+env(safe-area-inset-bottom))] md:pb-0">
              {children}
            </main>
          </div>
        </div>
        <Suspense fallback={<MobileTabBarFallback />}>
          <MobileTabBarSlot />
        </Suspense>
      </div>
      <QuickCaptureDialog />
    </CaptureProvider>
  );
}
