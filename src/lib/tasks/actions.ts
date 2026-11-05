"use server";

import { revalidatePath } from "next/cache";

import { getCurrentUser } from "@/lib/auth/session";
import { getTimeZone } from "@/lib/config";
import { repository } from "@/lib/data";
import {
  createTaskUpdateSchema,
  subtaskInputSchema,
  taskNoteInputSchema,
} from "@/lib/domain/task";
import type { FormState } from "@/lib/forms/form-state";
import { isValidId, runFormAction } from "@/lib/forms/run-form-action";

export async function updateTask(
  taskId: string,
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  return runFormAction({
    formData,
    ids: [taskId],
    schema: createTaskUpdateSchema(getTimeZone()),
    run: (input) => repository.updateTask(taskId, input),
    successMessage: "Saved.",
  });
}

/** Reopening goes back to To do, since the previous status isn't kept. */
export async function setTaskDone(taskId: string, done: boolean): Promise<void> {
  await getCurrentUser();
  if (!isValidId(taskId)) return;
  await repository.setTaskStatus(taskId, done ? "done" : "todo");
  revalidatePath("/", "layout");
}

export async function addSubtask(
  taskId: string,
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  return runFormAction({
    formData,
    ids: [taskId],
    schema: subtaskInputSchema,
    run: ({ title }) => repository.createSubtask(taskId, title),
    successMessage: "Subtask added.",
  });
}

export async function setSubtaskDone(id: string, done: boolean): Promise<void> {
  await getCurrentUser();
  if (!isValidId(id)) return;
  await repository.setSubtaskStatus(id, done ? "done" : "todo");
  revalidatePath("/", "layout");
}

export async function deleteSubtask(id: string): Promise<void> {
  await getCurrentUser();
  if (!isValidId(id)) return;
  await repository.deleteSubtask(id);
  revalidatePath("/", "layout");
}

export async function addNote(
  taskId: string,
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  return runFormAction({
    formData,
    ids: [taskId],
    schema: taskNoteInputSchema,
    run: ({ body }) => repository.createNote(taskId, body),
    successMessage: "Note added.",
  });
}

export async function deleteNote(id: string): Promise<void> {
  await getCurrentUser();
  if (!isValidId(id)) return;
  await repository.deleteNote(id);
  revalidatePath("/", "layout");
}
