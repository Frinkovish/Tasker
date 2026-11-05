"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { Workspace } from "@/lib/domain/workspace";
import { updateWorkspace } from "@/lib/workspaces/actions";
import { useFormAction } from "@/lib/forms/use-form-action";

import { FormMessage } from "@/components/common/form-message";

interface WorkspaceSettingsFormProps {
  workspace: Pick<Workspace, "id" | "name" | "description" | "color">;
  /** Changes with the saved workspace, so its fields can show what's now saved. */
  savedAt: number;
}

export function WorkspaceSettingsForm({
  workspace,
  savedAt,
}: WorkspaceSettingsFormProps) {
  const { state, action, isPending, clearMessage } = useFormAction(
    updateWorkspace.bind(null, workspace.id),
  );

  return (
    <form
      action={action}
      onChange={clearMessage}
      className="space-y-4 rounded-lg border p-4"
    >
      {/* Only the fields restart. The form has to stay, or "Saved." would go with it. */}
      <div key={`${state.revision}:${savedAt}`} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto]">
          <div className="space-y-2">
            <Label htmlFor="workspace-name">Name</Label>
            <Input
              id="workspace-name"
              name="name"
              required
              maxLength={60}
              defaultValue={state.values.name ?? workspace.name}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="workspace-color">Colour</Label>
            <Input
              id="workspace-color"
              name="color"
              type="color"
              className="w-16 p-1"
              defaultValue={state.values.color ?? workspace.color}
            />
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="workspace-description">Description</Label>
          <Textarea
            id="workspace-description"
            name="description"
            rows={2}
            maxLength={280}
            className="resize-none"
            defaultValue={state.values.description ?? workspace.description}
          />
        </div>
      </div>
      <FormMessage state={state} />
      <Button type="submit" disabled={isPending}>
        {isPending ? "Saving…" : "Save changes"}
      </Button>
    </form>
  );
}
