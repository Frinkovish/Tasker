"use client";

import Link from "next/link";
import { useState } from "react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

import { CaptureForm } from "./capture-form";
import { useCapture } from "./capture-provider";

export function QuickCaptureDialog() {
  const { isQuickCaptureOpen, setQuickCaptureOpen } = useCapture();
  const [draft, setDraft] = useState("");

  return (
    <Dialog open={isQuickCaptureOpen} onOpenChange={setQuickCaptureOpen}>
      {/* Near the top, so the on-screen keyboard doesn't cover it on mobile. */}
      <DialogContent className="top-[8%] translate-y-0 sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Capture a request</DialogTitle>
          <DialogDescription>
            Write it in your own words. You don&apos;t need to organize it.
          </DialogDescription>
        </DialogHeader>
        <CaptureForm
          autoFocus
          value={draft}
          onValueChange={setDraft}
          confirmationAction={
            <Link
              href="/inbox"
              className="font-medium text-foreground underline underline-offset-4"
              onClick={() => setQuickCaptureOpen(false)}
            >
              View in inbox
            </Link>
          }
        />
      </DialogContent>
    </Dialog>
  );
}
