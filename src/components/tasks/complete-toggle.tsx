"use client";

import { Check } from "lucide-react";
import { useFormStatus } from "react-dom";

import { cn } from "@/lib/utils";

function ToggleButton({ isDone, label }: { isDone: boolean; label: string }) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      aria-label={label}
      title={label}
      className={cn(
        "relative z-10 flex size-5 shrink-0 items-center justify-center rounded-full border border-input outline-none transition-colors hover:border-foreground focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50 after:absolute after:-inset-3",
        isDone && "border-primary bg-primary text-primary-foreground",
      )}
    >
      {isDone && <Check className="size-3.5" aria-hidden />}
    </button>
  );
}

interface CompleteToggleProps {
  isDone: boolean;
  /** What the button does and to what, for screen readers and the tooltip. */
  label: string;
  action: () => Promise<void>;
}

/** Used for both tasks and subtasks. The tappable area is larger than the circle. */
export function CompleteToggle({ isDone, label, action }: CompleteToggleProps) {
  return (
    <form action={action} className="flex">
      <ToggleButton isDone={isDone} label={label} />
    </form>
  );
}
