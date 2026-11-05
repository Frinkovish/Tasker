"use server";

import { revalidatePath } from "next/cache";

import { getCurrentUser } from "@/lib/auth/session";
import { repository } from "@/lib/data";
import {
  projectInputSchema,
  stakeholderInputSchema,
  workspaceUpdateSchema,
} from "@/lib/domain/workspace";
import type { FormState } from "@/lib/forms/form-state";
import { isValidId, runFormAction } from "@/lib/forms/run-form-action";

export async function updateWorkspace(
  workspaceId: string,
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  return runFormAction({
    formData,
    ids: [workspaceId],
    schema: workspaceUpdateSchema,
    run: (input) => repository.updateWorkspace(workspaceId, input),
    successMessage: "Saved.",
  });
}

export async function createStakeholder(
  workspaceId: string,
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  return runFormAction({
    formData,
    ids: [workspaceId],
    schema: stakeholderInputSchema,
    run: (input) => repository.createStakeholder(workspaceId, input),
    successMessage: "Stakeholder added.",
  });
}

export async function createProject(
  workspaceId: string,
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  return runFormAction({
    formData,
    ids: [workspaceId],
    schema: projectInputSchema,
    run: (input) => repository.createProject(workspaceId, input),
    successMessage: "Project added.",
  });
}

export async function deleteStakeholder(id: string): Promise<void> {
  await getCurrentUser();
  if (!isValidId(id)) return;
  await repository.deleteStakeholder(id);
  revalidatePath("/", "layout");
}

export async function deleteProject(id: string): Promise<void> {
  await getCurrentUser();
  if (!isValidId(id)) return;
  await repository.deleteProject(id);
  revalidatePath("/", "layout");
}
