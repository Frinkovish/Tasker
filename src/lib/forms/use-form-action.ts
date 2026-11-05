"use client";

import { unstable_rethrow } from "next/navigation";
import { useActionState, useState } from "react";

import {
  INITIAL_FORM_STATE,
  readFormValues,
  type FormState,
} from "./form-state";

type FormAction = (previous: FormState, formData: FormData) => Promise<FormState>;

/**
 * Connects a form to its server action. A lost connection, which is common on a
 * phone, keeps what was typed instead of replacing the page with an error. A message
 * goes away once the form is edited, because it's about what was last submitted.
 */
export function useFormAction(serverAction: FormAction) {
  const [state, action, isPending] = useActionState(
    async (previous: FormState, formData: FormData): Promise<FormState> => {
      try {
        return await serverAction(previous, formData);
      } catch (error) {
        // A redirect from the action arrives as an error, and has to carry on.
        unstable_rethrow(error);
        return {
          status: "error",
          message:
            "The server couldn't be reached, so that wasn't saved. What you typed is still here, so try again.",
          values: readFormValues(formData),
          revision: Date.now(),
        };
      }
    },
    INITIAL_FORM_STATE,
  );

  const [clearedRevision, setClearedRevision] = useState<number | null>(null);

  return {
    state:
      clearedRevision === state.revision ? { ...state, message: null } : state,
    action,
    isPending,
    clearMessage: () => setClearedRevision(state.revision),
  };
}
