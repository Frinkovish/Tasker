"use client";

import { useActionState } from "react";

import { EmptyState } from "@/components/common/page";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { Stakeholder } from "@/lib/domain/workspace";
import { createStakeholder, deleteStakeholder } from "@/lib/workspaces/actions";
import { INITIAL_FORM_STATE } from "@/lib/workspaces/form-state";

import { DeleteButton } from "./delete-button";
import { FormMessage } from "./form-message";

interface StakeholdersSectionProps {
  workspaceId: string;
  stakeholders: readonly Stakeholder[];
}

export function StakeholdersSection({
  workspaceId,
  stakeholders,
}: StakeholdersSectionProps) {
  const [state, action, isPending] = useActionState(
    createStakeholder.bind(null, workspaceId),
    INITIAL_FORM_STATE,
  );

  return (
    <div className="space-y-3">
      {stakeholders.length === 0 ? (
        <EmptyState>No stakeholders yet.</EmptyState>
      ) : (
        <ul className="divide-y rounded-lg border">
          {stakeholders.map((stakeholder) => (
            <li
              key={stakeholder.id}
              className="flex items-center justify-between gap-3 px-4 py-2"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">
                  {stakeholder.name}
                </p>
                {(stakeholder.role || stakeholder.contactDetails) && (
                  <p className="truncate text-xs text-muted-foreground">
                    {[stakeholder.role, stakeholder.contactDetails]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                )}
              </div>
              <DeleteButton
                label={`Delete ${stakeholder.name}`}
                confirmation={`Delete ${stakeholder.name}? Their tasks stay, without a stakeholder.`}
                action={deleteStakeholder.bind(null, stakeholder.id)}
              />
            </li>
          ))}
        </ul>
      )}

      <form action={action} className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="space-y-2">
            <Label htmlFor="stakeholder-name">Name</Label>
            <Input
              id="stakeholder-name"
              name="name"
              required
              maxLength={120}
              defaultValue={state.values.name}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="stakeholder-role">Role (optional)</Label>
            <Input
              id="stakeholder-role"
              name="role"
              maxLength={120}
              defaultValue={state.values.role}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="stakeholder-contact">Contact (optional)</Label>
            <Input
              id="stakeholder-contact"
              name="contactDetails"
              maxLength={280}
              defaultValue={state.values.contactDetails}
            />
          </div>
        </div>
        <FormMessage state={state} />
        <Button type="submit" variant="outline" disabled={isPending}>
          {isPending ? "Adding…" : "Add stakeholder"}
        </Button>
      </form>
    </div>
  );
}
