"use client";

import {
  useId,
  useState,
  useTransition,
  type KeyboardEvent,
  type ReactNode,
} from "react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { createCapture } from "@/lib/captures/actions";
import { captureInputSchema } from "@/lib/domain/capture";

export const CAPTURE_PLACEHOLDER =
  "Emma asked me to update the ELD dashboard with new enrollment figures before Thursday. It should include validation rules.";

interface CaptureFormProps {
  /** The draft is held by the parent, so it survives closing the dialog. */
  value: string;
  onValueChange: (value: string) => void;
  autoFocus?: boolean;
  /** Shown after the confirmation message, such as a link to the inbox. */
  confirmationAction?: ReactNode;
}

export function CaptureForm({
  value,
  onValueChange,
  autoFocus,
  confirmationAction,
}: CaptureFormProps) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [justCaptured, setJustCaptured] = useState(false);
  const errorId = useId();

  const submit = () => {
    if (isPending) return;

    const parsed = captureInputSchema.safeParse({ text: value });
    if (!parsed.success) {
      setError(parsed.error.issues[0].message);
      setJustCaptured(false);
      return;
    }

    startTransition(async () => {
      // The text is only cleared once it's saved, so a failure can't lose it.
      // Catching here also keeps a dropped connection from replacing the page
      // with an error screen, which would throw the text away.
      const result = await createCapture(parsed.data.text).catch(() => ({
        error: "Couldn't reach the server. Your text is still here, so try again.",
      }));
      if (result.error) {
        setError(result.error);
        setJustCaptured(false);
        return;
      }
      onValueChange("");
      setError(null);
      setJustCaptured(true);
    });
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    // isComposing: Enter is confirming IME text here, not submitting the form.
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      submit();
    }
  };

  return (
    <form
      noValidate
      className="space-y-3"
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <Textarea
        aria-label="Describe the request"
        aria-invalid={error !== null}
        aria-describedby={error ? errorId : undefined}
        autoFocus={autoFocus}
        rows={4}
        value={value}
        readOnly={isPending}
        placeholder={CAPTURE_PLACEHOLDER}
        className="resize-none"
        onKeyDown={onKeyDown}
        onChange={(event) => {
          onValueChange(event.target.value);
          setError(null);
          setJustCaptured(false);
        }}
      />
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <p className="hidden text-xs text-muted-foreground md:block">
          Enter to capture · Shift + Enter for a new line
        </p>
        <Button type="submit" disabled={isPending} className="ml-auto">
          {isPending ? "Capturing…" : "Capture"}
        </Button>
      </div>

      {error && (
        <p id={errorId} role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <div role="status" className="text-sm text-muted-foreground">
        {justCaptured && (
          <p>
            Captured and saved to your inbox. {confirmationAction}
          </p>
        )}
      </div>
    </form>
  );
}
