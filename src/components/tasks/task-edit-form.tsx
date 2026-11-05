"use client";

import { FormMessage } from "@/components/common/form-message";
import { Button } from "@/components/ui/button";
import { useFormAction } from "@/lib/forms/use-form-action";
import { updateTask } from "@/lib/tasks/actions";

import {
  TaskFields,
  type SelectOption,
  type TaskFieldValues,
} from "./task-fields";

interface TaskEditFormProps {
  taskId: string;
  /** Changes with the saved task, so its fields can show what's now saved. */
  savedAt: number;
  /** Plain strings, already converted to the user's time zone by the server. */
  values: TaskFieldValues;
  stakeholders: readonly SelectOption[];
  projects: readonly SelectOption[];
}

export function TaskEditForm({
  taskId,
  savedAt,
  values,
  stakeholders,
  projects,
}: TaskEditFormProps) {
  const { state, action, isPending, clearMessage } = useFormAction(
    updateTask.bind(null, taskId),
  );

  return (
    <form action={action} onChange={clearMessage} className="space-y-4 rounded-lg border p-4">
      <TaskFields
        // Only the fields restart. The form has to stay, or "Saved." would go with it.
        key={`${state.revision}:${savedAt}`}
        stakeholders={stakeholders}
        projects={projects}
        // After a failed save, show what was typed rather than the saved values.
        values={{ ...values, ...state.values }}
      />
      <FormMessage state={state} />
      <Button type="submit" disabled={isPending}>
        {isPending ? "Saving…" : "Save changes"}
      </Button>
    </form>
  );
}
