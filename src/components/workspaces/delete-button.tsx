"use client";

import { Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";

interface DeleteButtonProps {
  label: string;
  confirmation: string;
  action: () => Promise<void>;
}

/** Deleting always asks first, because it can't be undone. */
export function DeleteButton({
  label,
  confirmation,
  action,
}: DeleteButtonProps) {
  return (
    <form
      action={action}
      onSubmit={(event) => {
        if (!window.confirm(confirmation)) event.preventDefault();
      }}
    >
      <Button
        type="submit"
        variant="ghost"
        size="icon"
        aria-label={label}
        title={label}
      >
        <Trash2 aria-hidden />
      </Button>
    </form>
  );
}
