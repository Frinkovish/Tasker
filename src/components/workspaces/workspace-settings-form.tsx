"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { Workspace } from "@/lib/domain/workspace";
import { updateWorkspace } from "@/lib/workspaces/actions";
import { INITIAL_FORM_STATE } from "@/lib/workspaces/form-state";

import { FormMessage } from "./form-message";

interface WorkspaceSettingsFormProps {
  workspace: Pick<Workspace, "id" | "name" | "description" | "color">;
}

export function WorkspaceSettingsForm({
  workspace,
}: WorkspaceSettingsFormProps) {
  const [state, action, isPending] = useActionState(
    updateWorkspace.bind(null, workspace.id),
    INITIAL_FORM_STATE,
  );

  return (
    <form action={action} className="space-y-4 rounded-lg border p-4">
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
      <FormMessage state={state} />
      <Button type="submit" disabled={isPending}>
        {isPending ? "Saving…" : "Save changes"}
      </Button>
    </form>
  );
}
