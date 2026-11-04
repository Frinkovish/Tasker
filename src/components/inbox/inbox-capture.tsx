"use client";

import { useState } from "react";

import { CaptureForm } from "@/components/capture/capture-form";
import { useCapture } from "@/components/capture/capture-provider";
import { Section } from "@/components/common/page";
import { Badge } from "@/components/ui/badge";

export function InboxCapture() {
  const { captures } = useCapture();
  const [draft, setDraft] = useState("");

  return (
    <>
      <CaptureForm value={draft} onValueChange={setDraft} />

      {captures.length > 0 && (
        <Section
          title="Captured this session"
          description="Kept in this browser tab only and lost on reload. Saving arrives in Phase 3, AI extraction in Phase 4."
        >
          <ul className="divide-y rounded-lg border">
            {captures.map((capture) => (
              <li
                key={capture.id}
                className="flex items-start justify-between gap-3 px-4 py-3"
              >
                <p className="min-w-0 text-sm break-words whitespace-pre-wrap">
                  {capture.text}
                </p>
                <Badge
                  variant="outline"
                  className="shrink-0 text-muted-foreground"
                >
                  Not saved
                </Badge>
              </li>
            ))}
          </ul>
        </Section>
      )}
    </>
  );
}
