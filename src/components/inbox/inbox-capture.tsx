"use client";

import { useState } from "react";

import { CaptureForm } from "@/components/capture/capture-form";

export function InboxCapture() {
  const [draft, setDraft] = useState("");

  return <CaptureForm value={draft} onValueChange={setDraft} />;
}
