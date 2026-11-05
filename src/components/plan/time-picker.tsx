import Form from "next/form";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatMinutes } from "@/lib/format";
import { buildPlanHref } from "@/lib/prioritization/plan";
import { cn } from "@/lib/utils";

const PRESETS = [30, 60, 120, 240];

interface TimePickerProps {
  minutes: number | null;
  workspaceId: string | null;
}

/** Time is optional and lasts for this view: capacity is never assumed or stored. */
export function TimePicker({ minutes, workspaceId }: TimePickerProps) {
  const chip =
    "inline-flex h-(--control-h-sm) min-w-(--control-h-sm) items-center justify-center rounded-md border px-3 text-xs outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring";

  return (
    <section aria-label="Time available" className="space-y-2">
      <h2 className="text-sm font-medium">How much time do you have?</h2>
      <div className="flex flex-wrap items-center gap-2">
        {PRESETS.map((preset) => (
          <Link
            key={preset}
            href={buildPlanHref(preset, workspaceId)}
            aria-current={minutes === preset ? "true" : undefined}
            className={cn(
              chip,
              minutes === preset &&
                "border-primary bg-primary text-primary-foreground hover:bg-primary/90",
            )}
          >
            {formatMinutes(preset)}
          </Link>
        ))}
        <Form action="/plan" className="flex items-center gap-2">
          {workspaceId && (
            <input type="hidden" name="workspace" value={workspaceId} />
          )}
          <Input
            // Keeps the box in step when a preset link changes the time.
            key={minutes ?? "none"}
            name="minutes"
            type="number"
            min={1}
            max={1440}
            aria-label="Minutes available"
            placeholder="Minutes"
            defaultValue={
              minutes !== null && !PRESETS.includes(minutes) ? minutes : undefined
            }
            className="h-(--control-h-sm) w-24"
          />
          <Button type="submit" variant="outline" size="sm">
            Set
          </Button>
        </Form>
        {minutes !== null && (
          <Link
            href={buildPlanHref(null, workspaceId)}
            className="inline-flex h-(--control-h-sm) min-w-(--control-h-sm) items-center justify-center text-xs text-muted-foreground underline underline-offset-4 hover:text-foreground"
          >
            Clear
          </Link>
        )}
      </div>
    </section>
  );
}
