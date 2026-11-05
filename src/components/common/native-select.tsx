import type { ComponentProps } from "react";

import { cn } from "@/lib/utils";

/**
 * A styled native select. It's lighter than a custom menu and gives phones their
 * own built-in picker.
 */
export function NativeSelect({
  className,
  ...props
}: ComponentProps<"select">) {
  return (
    <select
      className={cn(
        "h-(--control-h) w-full min-w-0 rounded-lg border border-input bg-transparent px-2 py-1 text-(length:--control-text) outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive dark:bg-input/30 [&>option]:bg-popover [&>option]:text-popover-foreground",
        className,
      )}
      {...props}
    />
  );
}
