/** What a form's server action reports back to the form. */
export interface FormState {
  status: "idle" | "success" | "error";
  message: string | null;
  /** What the user typed, restored after an error so it isn't lost. */
  values: Record<string, string>;
}

export const INITIAL_FORM_STATE: FormState = {
  status: "idle",
  message: null,
  values: {},
};
