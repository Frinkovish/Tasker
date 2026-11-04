import { Compass } from "lucide-react";

export function Brand() {
  return (
    <span className="flex items-center gap-2 text-sm font-semibold tracking-tight">
      <span className="flex size-6 items-center justify-center rounded-md bg-primary text-primary-foreground">
        <Compass className="size-4" aria-hidden />
      </span>
      WorkPilot
    </span>
  );
}
