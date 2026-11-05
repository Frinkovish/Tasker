"use client";

import { DeleteButton } from "@/components/common/delete-button";
import { FormMessage } from "@/components/common/form-message";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { Subtask } from "@/lib/domain/task";
import { useFormAction } from "@/lib/forms/use-form-action";
import {
  addSubtask,
  deleteSubtask,
  setSubtaskDone,
} from "@/lib/tasks/actions";
import { cn } from "@/lib/utils";

import { CompleteToggle } from "./complete-toggle";

interface SubtasksSectionProps {
  taskId: string;
  subtasks: readonly Subtask[];
}

export function SubtasksSection({ taskId, subtasks }: SubtasksSectionProps) {
  const { state, action, isPending, clearMessage } = useFormAction(
    addSubtask.bind(null, taskId),
  );

  return (
    <div className="space-y-3">
      {subtasks.length > 0 && (
        <ul className="divide-y rounded-lg border">
          {subtasks.map((subtask) => {
            const isDone = subtask.status === "done";
            return (
              <li
                key={subtask.id}
                className="flex items-center gap-3 px-4 py-1.5"
              >
                <CompleteToggle
                  isDone={isDone}
                  label={
                    isDone
                      ? `Reopen ${subtask.title}`
                      : `Mark ${subtask.title} complete`
                  }
                  action={setSubtaskDone.bind(null, subtask.id, !isDone)}
                />
                <span
                  className={cn(
                    "min-w-0 flex-1 text-sm break-words",
                    isDone && "text-muted-foreground line-through",
                  )}
                >
                  {subtask.title}
                </span>
                <DeleteButton
                  label={`Delete ${subtask.title}`}
                  confirmation={`Delete the subtask "${subtask.title}"?`}
                  action={deleteSubtask.bind(null, subtask.id)}
                />
              </li>
            );
          })}
        </ul>
      )}
      <form action={action} onChange={clearMessage} className="space-y-2">
        <div className="flex gap-2">
          <Input
            key={state.revision}
            name="title"
            aria-label="New subtask"
            placeholder="Add a subtask"
            maxLength={200}
            defaultValue={state.values.title}
          />
          <Button type="submit" variant="outline" disabled={isPending}>
            Add
          </Button>
        </div>
        <FormMessage state={state} />
      </form>
    </div>
  );
}
