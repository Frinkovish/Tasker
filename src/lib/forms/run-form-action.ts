import "server-only";

import { revalidatePath } from "next/cache";
import { unstable_rethrow } from "next/navigation";
import { z } from "zod";

import { getCurrentUser } from "@/lib/auth/session";
import { UserFacingError } from "@/lib/data/errors";

import { readFormValues, type FormState } from "./form-state";

const idSchema = z.uuid();

export const isValidId = (id: string) => idSchema.safeParse(id).success;

/**
 * The shared path for every form: check the user, validate, run the change and
 * refresh the app. The whole layout is revalidated because the same data also
 * appears in the navigation and on the dashboard.
 */
export async function runFormAction<Input>(options: {
  formData: FormData;
  ids: readonly string[];
  schema: z.ZodType<Input>;
  run: (input: Input) => Promise<unknown>;
  successMessage: string;
}): Promise<FormState> {
  await getCurrentUser();

  const revision = Date.now();
  const values = readFormValues(options.formData);
  const fail = (message: string): FormState => ({
    status: "error",
    message,
    values,
    revision,
  });

  if (!options.ids.every(isValidId)) return fail("This item no longer exists.");

  const parsed = options.schema.safeParse(values);
  if (!parsed.success) return fail(parsed.error.issues[0].message);

  try {
    await options.run(parsed.data);
  } catch (error) {
    unstable_rethrow(error);
    if (error instanceof UserFacingError) return fail(error.message);
    console.error(error);
    return fail("That couldn't be saved. Try again.");
  }

  revalidatePath("/", "layout");
  return {
    status: "success",
    message: options.successMessage,
    values: {},
    revision,
  };
}
