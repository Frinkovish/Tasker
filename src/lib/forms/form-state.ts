/** What a form's server action reports back to the form. */
export interface FormState {
  status: "idle" | "success" | "error";
  message: string | null;
  /** What the user typed, restored after an error so it isn't lost. */
  values: Record<string, string>;
  /** Changes on every submission, so forms can remount with the right defaults. */
  revision: number;
}

/** The form's text fields, without the hidden ones React adds for server actions. */
export function readFormValues(formData: FormData): Record<string, string> {
  return Object.fromEntries(
    [...formData.entries()]
      .filter(([key, value]) => !key.startsWith("$") && typeof value === "string")
      .map(([key, value]) => [key, value as string]),
  );
}

export const INITIAL_FORM_STATE: FormState = {
  status: "idle",
  message: null,
  values: {},
  revision: 0,
};
