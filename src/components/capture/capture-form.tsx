"use client";

import { useId, useState, type KeyboardEvent, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { captureInputSchema } from "@/lib/domain/capture";

import { useCapture } from "./capture-provider";

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
  const { addCapture } = useCapture();
  const [error, setError] = useState<string | null>(null);
  const [justCaptured, setJustCaptured] = useState(false);
  const errorId = useId();

  const submit = () => {
    const result = captureInputSchema.safeParse({ text: value });
    if (!result.success) {
      setError(result.error.issues[0].message);
      setJustCaptured(false);
      return;
    }
    addCapture(result.data.text);
    onValueChange("");
    setError(null);
    setJustCaptured(true);
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
        placeholder={CAPTURE_PLACEHOLDER}
        className="resize-none text-base md:text-sm"
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
        <Button type="submit" className="ml-auto">
          Capture
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
            Captured for this session only. It isn&apos;t saved yet.{" "}
            {confirmationAction}
          </p>
        )}
      </div>
    </form>
  );
}
