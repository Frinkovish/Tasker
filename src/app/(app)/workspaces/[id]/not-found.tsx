import Link from "next/link";

import { PageContainer, PageHeader } from "@/components/common/page";

export default function WorkspaceNotFound() {
  return (
    <PageContainer>
      <PageHeader
        title="Workspace not found"
        description="This workspace doesn't exist or the link is out of date."
      />
      <Link
        href="/dashboard"
        className="inline-block text-sm underline underline-offset-4"
      >
        Back to the dashboard
      </Link>
    </PageContainer>
  );
}
