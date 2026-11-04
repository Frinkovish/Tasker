import { Skeleton } from "@/components/ui/skeleton";

/* Each fallback matches the real piece's size, so nothing shifts on load. */

export function SidebarFallback() {
  return (
    <div
      aria-hidden
      className="sticky top-0 hidden h-dvh flex-col gap-4 border-r bg-sidebar p-3 md:flex"
    >
      <Skeleton className="h-8 w-28" />
      <Skeleton className="h-8 w-full" />
      <Skeleton className="h-8 w-full" />
    </div>
  );
}

export function MobileTopBarFallback() {
  return (
    <div
      aria-hidden
      className="sticky top-0 z-30 flex h-14 items-center border-b bg-background px-4 md:hidden"
    >
      <Skeleton className="h-8 w-full" />
    </div>
  );
}

export function MobileTabBarFallback() {
  return (
    <div
      aria-hidden
      className="fixed inset-x-0 bottom-0 z-30 h-16 border-t bg-background pb-[env(safe-area-inset-bottom)] md:hidden"
    />
  );
}
