"use client";

import { EmptyState } from "@/components/common/page";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PROJECT_STATUS_LABELS, type Project } from "@/lib/domain/workspace";
import { createProject, deleteProject } from "@/lib/workspaces/actions";
import { useFormAction } from "@/lib/forms/use-form-action";

import { DeleteButton } from "@/components/common/delete-button";
import { FormMessage } from "@/components/common/form-message";

interface ProjectsSectionProps {
  workspaceId: string;
  projects: readonly Project[];
}

export function ProjectsSection({
  workspaceId,
  projects,
}: ProjectsSectionProps) {
  const { state, action, isPending, clearMessage } = useFormAction(
    createProject.bind(null, workspaceId),
  );

  return (
    <div className="space-y-3">
      {projects.length === 0 ? (
        <EmptyState>No projects yet.</EmptyState>
      ) : (
        <ul className="divide-y rounded-lg border">
          {projects.map((project) => (
            <li
              key={project.id}
              className="flex items-center justify-between gap-3 px-4 py-2"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{project.name}</p>
                {project.description && (
                  <p className="truncate text-xs text-muted-foreground">
                    {project.description}
                  </p>
                )}
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <Badge variant="outline" className="text-muted-foreground">
                  {PROJECT_STATUS_LABELS[project.status]}
                </Badge>
                <DeleteButton
                  label={`Delete ${project.name}`}
                  confirmation={`Delete ${project.name}? Its tasks stay, without a project.`}
                  action={deleteProject.bind(null, project.id)}
                />
              </div>
            </li>
          ))}
        </ul>
      )}

      <form action={action} onChange={clearMessage} className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="project-name">Name</Label>
            <Input
              id="project-name"
              name="name"
              required
              maxLength={120}
              defaultValue={state.values.name}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="project-description">Description (optional)</Label>
            <Input
              id="project-description"
              name="description"
              maxLength={1000}
              defaultValue={state.values.description}
            />
          </div>
        </div>
        <FormMessage state={state} />
        <Button type="submit" variant="outline" disabled={isPending}>
          {isPending ? "Adding…" : "Add project"}
        </Button>
      </form>
    </div>
  );
}
