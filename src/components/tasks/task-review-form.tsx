"use client";

import { useState } from "react";

import { FormMessage } from "@/components/common/form-message";
import { NativeSelect } from "@/components/common/native-select";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import type { Extraction } from "@/lib/ai/extraction/sanitize";
import { reviewCapture } from "@/lib/captures/actions";
import { useFormAction } from "@/lib/forms/use-form-action";

import { FieldOrigin, TaskFields, type SelectOption } from "./task-fields";

export interface WorkspaceOptions extends SelectOption {
  stakeholders: readonly SelectOption[];
  projects: readonly SelectOption[];
}

const EMPTY_SUGGESTION: Extraction = {
  values: {
    workspaceId: "",
    title: "",
    description: "",
    stakeholderId: "",
    projectId: "",
    status: "todo",
    priority: "medium",
    deadlineDate: "",
    deadlineTime: "",
    estimatedMinutes: "",
    nextAction: "",
    waitingFor: "",
  },
  hints: {},
  questions: [],
  notes: [],
};

interface ReviewFieldsProps {
  workspaces: readonly WorkspaceOptions[];
  suggestion: Extraction;
  /** What was typed, after a failed save. It always beats a suggestion. */
  saved: Record<string, string>;
}

function ReviewFields({ workspaces, suggestion, saved }: ReviewFieldsProps) {
  const values = { ...suggestion.values, ...saved };
  const [workspaceId, setWorkspaceId] = useState(values.workspaceId);
  const workspace = workspaces.find((item) => item.id === workspaceId);

  return (
    <>
      <div className="space-y-2">
        <Label htmlFor="task-workspace">Workspace</Label>
        <NativeSelect
          id="task-workspace"
          name="workspaceId"
          // Uncontrolled: React resets the form after each submission, which
          // would blank a controlled select while its state kept the old value.
          defaultValue={values.workspaceId}
          onChange={(event) => setWorkspaceId(event.target.value)}
        >
          <option value="">Choose a workspace</option>
          {workspaces.map(({ id, name }) => (
            <option key={id} value={id}>
              {name}
            </option>
          ))}
        </NativeSelect>
        <FieldOrigin hint={suggestion.hints.workspaceId} />
      </div>
      <TaskFields
        relationsKey={workspaceId}
        relationsDisabled={!workspace}
        stakeholders={workspace?.stakeholders ?? []}
        projects={workspace?.projects ?? []}
        values={values}
        hints={suggestion.hints}
      />
    </>
  );
}

interface TaskReviewFormProps {
  captureId: string;
  workspaces: readonly WorkspaceOptions[];
  /** Absent when AI wasn't used, leaving the form for the user to fill in. */
  suggestion?: Extraction;
}

export function TaskReviewForm({
  captureId,
  workspaces,
  suggestion = EMPTY_SUGGESTION,
}: TaskReviewFormProps) {
  const { state, action, isPending, clearMessage } = useFormAction(
    reviewCapture.bind(null, captureId),
  );
  const hasPointsToCheck =
    suggestion.questions.length > 0 || suggestion.notes.length > 0;

  return (
    <form action={action} onChange={clearMessage} className="space-y-4">
      {hasPointsToCheck && (
        <section className="space-y-2 rounded-lg border bg-muted/50 px-4 py-3 text-sm">
          {suggestion.questions.length > 0 && (
            <>
              <h3 className="font-medium">Before you save</h3>
              <ul className="list-disc space-y-1 pl-4">
                {suggestion.questions.map((question) => (
                  <li key={question} className="break-words">
                    {question}
                  </li>
                ))}
              </ul>
            </>
          )}
          {suggestion.notes.length > 0 && (
            <ul className="space-y-1 text-muted-foreground">
              {suggestion.notes.map((note) => (
                <li key={note} className="break-words">
                  {note}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
      <ReviewFields
        key={state.revision}
        workspaces={workspaces}
        suggestion={suggestion}
        saved={state.values}
      />
      <FormMessage state={state} />
      <Button type="submit" disabled={isPending}>
        {isPending ? "Saving…" : "Save as task"}
      </Button>
    </form>
  );
}
