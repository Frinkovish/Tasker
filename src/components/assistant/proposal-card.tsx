"use client";

import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { unstable_rethrow } from "next/navigation";
import { useState, useTransition } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { confirmProposal, dismissProposal } from "@/lib/assistant/actions";
import type { ProposalView } from "@/lib/assistant/view";

const STATUS_LABELS = {
  applied: "Applied",
  dismissed: "Dismissed",
} as const;

/**
 * Shows exactly what would change, as worked out by the app from the real task, and
 * applies it only when the user says so. The model's own wording isn't used here, so
 * this is what to trust if its reply describes something different.
 */
export function ProposalCard({ proposal }: { proposal: ProposalView }) {
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const { id, status, taskId, taskTitle, workspace, rows } = proposal;

  const decide = (action: typeof confirmProposal) => {
    setError(null);
    startTransition(async () => {
      try {
        const result = await action(id);
        setError(result.error);
      } catch (caught) {
        unstable_rethrow(caught);
        setError("The server couldn't be reached. Nothing changed, so try again.");
      }
    });
  };

  return (
    <div className="space-y-3 rounded-lg border p-3 text-sm">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <Link
            href={`/tasks/${taskId}`}
            className="inline-block py-1 font-medium break-words underline-offset-4 hover:underline"
          >
            {taskTitle}
          </Link>
          {workspace && (
            <p className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
              <span
                aria-hidden
                className="size-2 shrink-0 rounded-full"
                style={{ backgroundColor: workspace.color }}
              />
              <span className="break-words">{workspace.name}</span>
            </p>
          )}
        </div>
        {status !== "pending" && (
          <Badge variant={status === "applied" ? "default" : "outline"}>
            {STATUS_LABELS[status]}
          </Badge>
        )}
      </div>

      <dl className="space-y-2">
        {rows.map(({ label, before, after, warning }) => (
          <div key={label}>
            <dt className="text-xs text-muted-foreground">{label}</dt>
            <dd className="flex flex-wrap items-center gap-x-1.5 break-words whitespace-pre-wrap">
              {before !== null && (
                <>
                  <span className="text-muted-foreground">{before}</span>
                  <ArrowRight
                    aria-label="changes to"
                    className="size-3.5 shrink-0 text-muted-foreground"
                  />
                </>
              )}
              <span className="min-w-0 font-medium">{after}</span>
            </dd>
            {warning && status === "pending" && (
              <p className="mt-0.5 text-xs text-destructive">{warning}</p>
            )}
          </div>
        ))}
      </dl>

      {error && (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}

      {status === "pending" && (
        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            disabled={isPending}
            onClick={() => decide(confirmProposal)}
            aria-label={`Confirm the change to ${taskTitle}`}
          >
            Confirm
          </Button>
          <Button
            size="sm"
            variant="ghost"
            disabled={isPending}
            onClick={() => decide(dismissProposal)}
            aria-label={`Dismiss the change to ${taskTitle}`}
          >
            Dismiss
          </Button>
          <span className="text-xs text-muted-foreground">
            {isPending ? "Saving…" : "Nothing has changed yet."}
          </span>
        </div>
      )}
    </div>
  );
}
