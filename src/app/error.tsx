"use client";

import { Button } from "@/components/ui/button";

/** Shown when something fails to load. Error details stay in the server logs. */
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main className="flex min-h-dvh items-center justify-center px-4">
      <div className="max-w-sm space-y-4 text-center">
        <h1 className="text-xl font-semibold tracking-tight">
          Something went wrong
        </h1>
        <p className="text-sm text-muted-foreground">
          That couldn&apos;t be loaded. Your data hasn&apos;t changed.
        </p>
        <Button onClick={reset}>Try again</Button>
      </div>
    </main>
  );
}
