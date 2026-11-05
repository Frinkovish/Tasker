"use client";

import Link from "next/link";
import { unstable_rethrow } from "next/navigation";
import {
  useEffect,
  useOptimistic,
  useRef,
  useState,
  useTransition,
  type KeyboardEvent,
} from "react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { sendAssistantMessage } from "@/lib/assistant/actions";
import type { MessageView } from "@/lib/assistant/view";
import { ASSISTANT_MESSAGE_MAX } from "@/lib/domain/assistant";

import { ProposalCard } from "./proposal-card";

const SUGGESTIONS = [
  "What should I work on today?",
  "What am I forgetting?",
  "What tasks are overdue?",
  "What am I waiting for?",
  "Which job has the heaviest workload?",
  "I have two hours available. What should I prioritize?",
];

function UserMessage({ content }: { content: string }) {
  return (
    <div className="flex justify-end">
      <p className="max-w-[85%] rounded-lg bg-muted px-3 py-2 text-sm break-words whitespace-pre-wrap">
        {content}
      </p>
    </div>
  );
}

function AssistantMessage({ message }: { message: MessageView }) {
  return (
    <div className="space-y-3">
      {/* Shown as plain text, so nothing in a reply can act as markup or a link. */}
      <p className="text-sm leading-relaxed break-words whitespace-pre-wrap">
        {message.content}
      </p>
      {message.proposals.map((proposal) => (
        <ProposalCard key={proposal.id} proposal={proposal} />
      ))}
      {message.references.length > 0 && (
        <ul className="flex flex-wrap gap-1.5">
          {message.references.map(({ id, title }) => (
            <li key={id} className="max-w-full">
              <Link
                href={`/tasks/${id}`}
                className="flex min-h-(--control-h-sm) items-center rounded-md border px-2.5 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <span className="truncate">{title}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

interface AssistantChatProps {
  /** Null for a conversation that hasn't started. */
  conversationId: string | null;
  messages: MessageView[];
  /** False when AI isn't set up. Past conversations can still be read. */
  isAvailable: boolean;
}

export function AssistantChat({
  conversationId,
  messages,
  isAvailable,
}: AssistantChatProps) {
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [sending, setSending] = useOptimistic<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  const entryCount = messages.length + (sending ? 1 : 0);
  useEffect(() => {
    if (entryCount > 0) endRef.current?.scrollIntoView({ block: "end" });
  }, [entryCount]);

  const send = (text: string) => {
    const message = text.trim();
    if (!message || isPending) return;

    setError(null);
    setDraft("");
    startTransition(async () => {
      setSending(message);
      try {
        const result = await sendAssistantMessage(conversationId, message);
        if (result.error) {
          setError(result.error);
          setDraft(message);
        }
      } catch (caught) {
        // Starting a conversation ends in a redirect, which arrives as an error.
        unstable_rethrow(caught);
        setError("The server couldn't be reached. Your message is still here.");
        setDraft(message);
      }
    });
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    // isComposing: Enter is confirming an accent or character, not sending.
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      send(draft);
    }
  };

  return (
    <div className="space-y-6">
      <div className="space-y-6" role="log" aria-label="Conversation">
        {messages.map((message) =>
          message.role === "user" ? (
            <UserMessage key={message.id} content={message.content} />
          ) : (
            <AssistantMessage key={message.id} message={message} />
          ),
        )}
        {sending && (
          <>
            <UserMessage content={sending} />
            <p role="status" className="text-sm text-muted-foreground">
              Checking your tasks…
            </p>
          </>
        )}
      </div>

      {entryCount === 0 && isAvailable && (
        <ul className="flex flex-wrap gap-2" aria-label="Suggested questions">
          {SUGGESTIONS.map((suggestion) => (
            <li key={suggestion}>
              <Button
                variant="outline"
                size="sm"
                className="h-auto min-h-(--control-h-sm) py-1.5 text-left whitespace-normal"
                disabled={isPending}
                onClick={() => send(suggestion)}
              >
                {suggestion}
              </Button>
            </li>
          ))}
        </ul>
      )}

      <div ref={endRef} className="scroll-mb-44" />

      {isAvailable ? (
        <form
          className="sticky bottom-[calc(4rem+env(safe-area-inset-bottom))] z-10 space-y-2 bg-background pt-2 pb-3 md:bottom-0"
          onSubmit={(event) => {
            event.preventDefault();
            send(draft);
          }}
        >
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <Textarea
            aria-label="Message the assistant"
            placeholder="Ask about your work, or ask for a change"
            rows={2}
            maxLength={ASSISTANT_MESSAGE_MAX}
            className="max-h-40 resize-none"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={onKeyDown}
          />
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs text-muted-foreground">
              Changes only happen when you confirm them.
            </p>
            <Button type="submit" disabled={isPending || !draft.trim()}>
              {isPending ? "Sending…" : "Send"}
            </Button>
          </div>
        </form>
      ) : (
        <p className="rounded-lg border border-dashed px-4 py-3 text-sm text-muted-foreground">
          The assistant isn&apos;t set up on this server, so it can&apos;t answer
          new questions.
        </p>
      )}
    </div>
  );
}
