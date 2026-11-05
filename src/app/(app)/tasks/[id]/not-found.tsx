import Link from "next/link";

import { PageContainer, PageHeader } from "@/components/common/page";

export default function TaskNotFound() {
  return (
    <PageContainer>
      <PageHeader
        title="Task not found"
        description="This task doesn't exist or the link is out of date."
      />
      <Link
        href="/tasks"
        className="inline-block text-sm underline underline-offset-4"
      >
        Back to tasks
      </Link>
    </PageContainer>
  );
}
