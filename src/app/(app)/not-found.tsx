import Link from "next/link";

import { PageContainer } from "@/components/common/page";

/** Also what's shown for something that belongs to someone else, by design. */
export default function NotFound() {
  return (
    <PageContainer>
      <div className="py-10 text-center">
        <h1 className="text-xl font-semibold tracking-tight">Not found</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          This may have been reviewed or deleted, or the link may be wrong.
        </p>
        <Link
          href="/dashboard"
          className="mt-2 inline-flex min-h-(--control-h-sm) items-center text-sm underline underline-offset-4"
        >
          Back to the dashboard
        </Link>
      </div>
    </PageContainer>
  );
}
