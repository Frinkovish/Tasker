import Link from "next/link";

import { PageContainer, PageHeader } from "@/components/common/page";

export default function ReviewNotFound() {
  return (
    <PageContainer>
      <PageHeader
        title="Request not found"
        description="It may already have been reviewed or discarded."
      />
      <Link
        href="/inbox"
        className="inline-block text-sm underline underline-offset-4"
      >
        Back to the inbox
      </Link>
    </PageContainer>
  );
}
