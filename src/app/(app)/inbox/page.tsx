import type { Metadata } from "next";
import { Suspense } from "react";

import {
  PageContainer,
  PageHeader,
  Section,
} from "@/components/common/page";
import { InboxCapture } from "@/components/inbox/inbox-capture";
import { ReviewList } from "@/components/inbox/review-list";
import { Skeleton } from "@/components/ui/skeleton";
import { repository } from "@/lib/data";
import { parseWorkspaceScope } from "@/lib/workspaces/scope";

export const metadata: Metadata = { title: "Inbox" };

export default function InboxPage({ searchParams }: PageProps<"/inbox">) {
  return (
    <PageContainer>
      <PageHeader
        title="Inbox"
        description="Capture a request in your own words. It isn't assigned to a workspace until it's reviewed."
      />
      <InboxCapture />
      <Suspense fallback={<Skeleton className="h-48 w-full" />}>
        <AwaitingReview searchParams={searchParams} />
      </Suspense>
    </PageContainer>
  );
}

async function AwaitingReview({
  searchParams,
}: Pick<PageProps<"/inbox">, "searchParams">) {
  const [{ workspace }, workspaces] = await Promise.all([
    searchParams,
    repository.listWorkspaces(),
  ]);
  const scope = parseWorkspaceScope(
    workspace,
    workspaces.map(({ id }) => id),
  );
  const [tasks, stakeholders] = await Promise.all([
    repository.listTasks(scope),
    repository.listStakeholders(scope),
  ]);
  const awaitingReview = tasks.filter((task) => task.status === "inbox");

  return (
    <Section title="Awaiting review">
      <ReviewList
        tasks={awaitingReview}
        workspaces={workspaces}
        stakeholders={stakeholders}
        now={new Date()}
      />
    </Section>
  );
}
