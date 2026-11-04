"use server";

import { revalidatePath } from "next/cache";
import { unstable_rethrow } from "next/navigation";
import { z } from "zod";

import { getCurrentUser } from "@/lib/auth/session";
import { repository } from "@/lib/data";
import {
  projectInputSchema,
  stakeholderInputSchema,
  workspaceUpdateSchema,
} from "@/lib/domain/workspace";

import type { FormState } from "./form-state";

const idSchema = z.uuid();

function readForm(formData: FormData): Record<string, string> {
  return Object.fromEntries(
    [...formData.entries()]
      // React adds its own hidden fields to forms that use server actions.
      .filter(([key, value]) => !key.startsWith("$") && typeof value === "string")
      .map(([key, value]) => [key, value as string]),
  );
}

/**
 * Validates the form, runs the change and refreshes the app. The layout is
 * revalidated because workspace details also appear in the navigation.
 */
async function runFormAction<Input>(options: {
  formData: FormData;
  ids: readonly string[];
  schema: z.ZodType<Input>;
  run: (input: Input) => Promise<void>;
  successMessage: string;
}): Promise<FormState> {
  await getCurrentUser();

  const values = readForm(options.formData);
  if (!options.ids.every((id) => idSchema.safeParse(id).success)) {
    return { status: "error", message: "This item no longer exists.", values };
  }

  const parsed = options.schema.safeParse(values);
  if (!parsed.success) {
    return { status: "error", message: parsed.error.issues[0].message, values };
  }

  try {
    await options.run(parsed.data);
  } catch (error) {
    unstable_rethrow(error);
    console.error(error);
    return {
      status: "error",
      message: "That couldn't be saved. Try again.",
      values,
    };
  }

  revalidatePath("/", "layout");
  return { status: "success", message: options.successMessage, values: {} };
}

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
  if (!idSchema.safeParse(id).success) return;
  await repository.deleteStakeholder(id);
  revalidatePath("/", "layout");
}

export async function deleteProject(id: string): Promise<void> {
  await getCurrentUser();
  if (!idSchema.safeParse(id).success) return;
  await repository.deleteProject(id);
  revalidatePath("/", "layout");
}
