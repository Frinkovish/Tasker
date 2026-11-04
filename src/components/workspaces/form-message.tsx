import type { FormState } from "@/lib/workspaces/form-state";

export function FormMessage({ state }: { state: FormState }) {
  if (!state.message) return null;

  return state.status === "error" ? (
    <p role="alert" className="text-sm text-destructive">
      {state.message}
    </p>
  ) : (
    <p role="status" className="text-sm text-muted-foreground">
      {state.message}
    </p>
  );
}
