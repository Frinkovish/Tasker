"use server";

import { revalidatePath } from "next/cache";
import { redirect, unstable_rethrow } from "next/navigation";

import { getCurrentUser } from "@/lib/auth/session";
import { getTimeZone } from "@/lib/config";
import { repository } from "@/lib/data";
import { captureInputSchema } from "@/lib/domain/capture";
import { createTaskReviewSchema } from "@/lib/domain/task";
import type { FormState } from "@/lib/forms/form-state";
import { isValidId, runFormAction } from "@/lib/forms/run-form-action";

export async function createCapture(
  text: string,
): Promise<{ error: string | null }> {
  await getCurrentUser();

  const parsed = captureInputSchema.safeParse({ text });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  try {
    await repository.createCapture(parsed.data.text);
  } catch (error) {
    unstable_rethrow(error);
    console.error(error);
    return { error: "That couldn't be saved. Your text is still here, so try again." };
  }

  revalidatePath("/", "layout");
  return { error: null };
}

export async function deleteCapture(id: string): Promise<void> {
  await getCurrentUser();
  if (!isValidId(id)) return;
  await repository.deleteCapture(id);
  revalidatePath("/", "layout");
}

export async function reviewCapture(
  captureId: string,
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const state = await runFormAction({
    formData,
    ids: [captureId],
    schema: createTaskReviewSchema(getTimeZone()),
    run: (input) => repository.reviewCapture(captureId, input),
    successMessage: "Saved.",
  });
  if (state.status === "success") redirect("/inbox");
  return state;
}
