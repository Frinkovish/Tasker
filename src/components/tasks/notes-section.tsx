"use client";

import { DeleteButton } from "@/components/common/delete-button";
import { FormMessage } from "@/components/common/form-message";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useFormAction } from "@/lib/forms/use-form-action";
import { addNote, deleteNote } from "@/lib/tasks/actions";

export interface NoteView {
  id: string;
  body: string;
  /** Already formatted by the server, in the user's time zone. */
  createdAtLabel: string;
}

interface NotesSectionProps {
  taskId: string;
  notes: readonly NoteView[];
}

export function NotesSection({ taskId, notes }: NotesSectionProps) {
  const { state, action, isPending, clearMessage } = useFormAction(
    addNote.bind(null, taskId),
  );

  return (
    <div className="space-y-3">
      <form action={action} onChange={clearMessage} className="space-y-2">
        <Textarea
          key={state.revision}
          name="body"
          aria-label="New note"
          placeholder="Add a note"
          rows={2}
          maxLength={5000}
          className="resize-y"
          defaultValue={state.values.body}
        />
        <FormMessage state={state} />
        <Button type="submit" variant="outline" disabled={isPending}>
          {isPending ? "Adding…" : "Add note"}
        </Button>
      </form>
      {notes.length > 0 && (
        <ul className="divide-y rounded-lg border">
          {notes.map((note) => (
            <li key={note.id} className="flex items-start gap-3 px-4 py-2">
              <div className="min-w-0 flex-1 space-y-1">
                <p className="text-sm break-words whitespace-pre-wrap">
                  {note.body}
                </p>
                <p className="text-xs text-muted-foreground">
                  {note.createdAtLabel}
                </p>
              </div>
              <DeleteButton
                label="Delete note"
                confirmation="Delete this note?"
                action={deleteNote.bind(null, note.id)}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
