"use client";

import { NativeSelect } from "@/components/common/native-select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { FieldHint } from "@/lib/ai/extraction/sanitize";
import {
  TASK_PRIORITIES,
  TASK_PRIORITY_LABELS,
  TASK_STATUSES,
  TASK_STATUS_LABELS,
} from "@/lib/domain/task";

export interface SelectOption {
  id: string;
  name: string;
}

export interface TaskFieldValues {
  title: string;
  description: string;
  stakeholderId: string;
  projectId: string;
  status: string;
  priority: string;
  deadlineDate: string;
  deadlineTime: string;
  estimatedMinutes: string;
  nextAction: string;
  waitingFor: string;
}

/** Says where a filled-in value came from: the user's words, or the AI's judgement. */
export function FieldOrigin({ hint }: { hint?: FieldHint }) {
  if (!hint) return null;

  return (
    <p className="text-xs break-words text-muted-foreground">
      {hint.source === "stated"
        ? `From your request${hint.evidence ? `: "${hint.evidence}"` : ""}`
        : `AI suggestion${hint.evidence ? `, based on "${hint.evidence}"` : ""}`}
    </p>
  );
}

interface TaskFieldsProps {
  values: TaskFieldValues;
  stakeholders: readonly SelectOption[];
  projects: readonly SelectOption[];
  /** Disabled until a workspace is chosen, since these belong to one. */
  relationsDisabled?: boolean;
  /**
   * Changing this resets only the stakeholder and project, which belong to one
   * workspace, so choosing another keeps everything else already typed.
   */
  relationsKey?: string;
  /** Where AI-filled values came from, when there are any. */
  hints?: Partial<Record<keyof TaskFieldValues, FieldHint>>;
}

/** The task form's fields, shared by reviewing a request and editing a task. */
export function TaskFields({
  values,
  stakeholders,
  projects,
  relationsDisabled = false,
  relationsKey,
  hints,
}: TaskFieldsProps) {
  return (
    <>
      <div className="space-y-2">
        <Label htmlFor="task-title">Title</Label>
        <Input
          id="task-title"
          name="title"
          required
          maxLength={200}
          defaultValue={values.title}
        />
        <FieldOrigin hint={hints?.title} />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="task-status">Status</Label>
          <NativeSelect
            id="task-status"
            name="status"
            defaultValue={values.status}
          >
            {TASK_STATUSES.map((status) => (
              <option key={status} value={status}>
                {TASK_STATUS_LABELS[status]}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="space-y-2">
          <Label htmlFor="task-priority">Priority</Label>
          <NativeSelect
            id="task-priority"
            name="priority"
            defaultValue={values.priority}
          >
            {TASK_PRIORITIES.map((priority) => (
              <option key={priority} value={priority}>
                {TASK_PRIORITY_LABELS[priority]}
              </option>
            ))}
          </NativeSelect>
          <FieldOrigin hint={hints?.priority} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="task-stakeholder">Stakeholder</Label>
          <NativeSelect
            key={relationsKey}
            id="task-stakeholder"
            name="stakeholderId"
            disabled={relationsDisabled}
            defaultValue={values.stakeholderId}
          >
            <option value="">None</option>
            {stakeholders.map(({ id, name }) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
          </NativeSelect>
          <FieldOrigin hint={hints?.stakeholderId} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="task-project">Project</Label>
          <NativeSelect
            key={relationsKey}
            id="task-project"
            name="projectId"
            disabled={relationsDisabled}
            defaultValue={values.projectId}
          >
            <option value="">None</option>
            {projects.map(({ id, name }) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
          </NativeSelect>
          <FieldOrigin hint={hints?.projectId} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="task-deadline-date">Deadline</Label>
          <Input
            id="task-deadline-date"
            name="deadlineDate"
            type="date"
            defaultValue={values.deadlineDate}
          />
          <FieldOrigin hint={hints?.deadlineDate} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="task-deadline-time">
            Time (optional, otherwise end of day)
          </Label>
          <Input
            id="task-deadline-time"
            name="deadlineTime"
            type="time"
            defaultValue={values.deadlineTime}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="task-estimate">Estimated minutes (optional)</Label>
          <Input
            id="task-estimate"
            name="estimatedMinutes"
            inputMode="numeric"
            defaultValue={values.estimatedMinutes}
          />
          <FieldOrigin hint={hints?.estimatedMinutes} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="task-waiting-for">Waiting for (optional)</Label>
          <Input
            id="task-waiting-for"
            name="waitingFor"
            maxLength={200}
            defaultValue={values.waitingFor}
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="task-next-action">Next action (optional)</Label>
        <Input
          id="task-next-action"
          name="nextAction"
          maxLength={500}
          defaultValue={values.nextAction}
        />
        <FieldOrigin hint={hints?.nextAction} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="task-description">Description (optional)</Label>
        <Textarea
          id="task-description"
          name="description"
          rows={3}
          maxLength={5000}
          className="resize-y"
          defaultValue={values.description}
        />
        <FieldOrigin hint={hints?.description} />
      </div>
    </>
  );
}
