"use server";

import { revalidatePath } from "next/cache";
import { redirect, RedirectType, unstable_rethrow } from "next/navigation";

import { getCurrentUser } from "@/lib/auth/session";
import { getTimeZone } from "@/lib/config";
import { repository } from "@/lib/data";
import { UserFacingError } from "@/lib/data/errors";
import {
  assistantInputSchema,
  buildConversationTitle,
  type AssistantProposal,
} from "@/lib/domain/assistant";
import {
  createTaskUpdateSchema,
  subtaskInputSchema,
  taskNoteInputSchema,
} from "@/lib/domain/task";
import { isValidId } from "@/lib/forms/run-form-action";

import { findChangedField, toTaskUpdateInput } from "./proposals";
import { runAssistantTurn } from "./run-turn";

type ActionResult = { error: string | null };

/**
 * Asks the assistant and saves the exchange together. If anything fails nothing is
 * saved, and the user's text stays in the box to send again.
 */
export async function sendAssistantMessage(
  conversationId: string | null,
  text: string,
): Promise<ActionResult> {
  await getCurrentUser();

  const parsed = assistantInputSchema.safeParse({ text });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const message = parsed.data.text;

  const missing = { error: "This conversation no longer exists." };
  if (conversationId !== null && !isValidId(conversationId)) return missing;

  let savedId: string;
  try {
    if (conversationId !== null) {
      const conversation = await repository.getConversation(conversationId);
      if (!conversation) return missing;
    }
    const history = conversationId
      ? await repository.listMessages(conversationId)
      : [];

    const turn = await runAssistantTurn(message, history);
    if (turn.status === "unavailable") {
      return { error: "The assistant isn't set up on this server." };
    }
    if (turn.status === "failed") {
      return {
        error: "The assistant couldn't answer just now, so nothing was saved. Try again.",
      };
    }

    savedId = await repository.recordAssistantTurn({
      conversationId,
      title: buildConversationTitle(message),
      userContent: message,
      assistantContent: turn.reply,
      referencedTaskIds: turn.referencedTaskIds,
      proposals: [...turn.proposals],
    });
  } catch (error) {
    unstable_rethrow(error);
    if (error instanceof UserFacingError) return { error: error.message };
    console.error(error);
    return { error: "That couldn't be saved. Try again." };
  }

  revalidatePath("/assistant");
  // A new conversation gets its own address, so reloading stays in it.
  if (conversationId === null) {
    redirect(`/assistant?c=${savedId}`, RedirectType.replace);
  }
  return { error: null };
}

/** Throws a UserFacingError if the proposal no longer applies, leaving it undecided. */
async function prepareProposal(
  proposal: AssistantProposal,
): Promise<() => Promise<void>> {
  const { taskId, payload } = proposal;
  switch (payload.kind) {
    case "update_task": {
      const task = await repository.getTask(taskId);
      if (!task) throw new UserFacingError("This task no longer exists.");

      const changedField = findChangedField(task, payload.changes);
      if (changedField) {
        throw new UserFacingError(
          `${changedField} has changed since this was proposed, so it wasn't applied. Dismiss this and ask again.`,
        );
      }
      const timeZone = getTimeZone();
      const update = createTaskUpdateSchema(timeZone).safeParse(
        toTaskUpdateInput(task, payload.changes, timeZone),
      );
      if (!update.success) throw new UserFacingError(update.error.issues[0].message);
      return () => repository.updateTask(taskId, update.data);
    }
    case "add_note": {
      const { body } = taskNoteInputSchema.parse({ body: payload.body });
      return () => repository.createNote(taskId, body);
    }
    case "add_subtask": {
      const { title } = subtaskInputSchema.parse({ title: payload.title });
      return () => repository.createSubtask(taskId, title);
    }
  }
}

/**
 * The only way a proposal changes anything. It claims the proposal first, so a double
 * click or a second tab can't apply it twice, and hands it back if the change fails.
 */
export async function confirmProposal(id: string): Promise<ActionResult> {
  await getCurrentUser();
  if (!isValidId(id)) return { error: "This change no longer exists." };

  try {
    const proposal = await repository.getProposal(id);
    if (!proposal) return { error: "This change no longer exists." };
    // Already decided, perhaps in another tab: refreshing shows the true state.
    if (proposal.status === "pending") {
      const apply = await prepareProposal(proposal);
      if (await repository.claimProposal(id, "applied")) {
        try {
          await apply();
        } catch (error) {
          await repository.reopenProposal(id);
          throw error;
        }
      }
    }
  } catch (error) {
    unstable_rethrow(error);
    if (error instanceof UserFacingError) return { error: error.message };
    console.error(error);
    return { error: "That couldn't be applied. Try again." };
  }

  // The change shows up across the app, so everything is refreshed.
  revalidatePath("/", "layout");
  return { error: null };
}

export async function dismissProposal(id: string): Promise<ActionResult> {
  await getCurrentUser();
  if (!isValidId(id)) return { error: "This change no longer exists." };

  try {
    await repository.claimProposal(id, "dismissed");
  } catch (error) {
    unstable_rethrow(error);
    console.error(error);
    return { error: "That couldn't be saved. Try again." };
  }

  revalidatePath("/assistant");
  return { error: null };
}

export async function deleteConversation(id: string): Promise<void> {
  await getCurrentUser();
  if (!isValidId(id)) return;
  await repository.deleteConversation(id);
  revalidatePath("/assistant");
}
