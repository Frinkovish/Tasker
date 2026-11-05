import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { AssistantChat } from "@/components/assistant/assistant-chat";
import { DeleteButton } from "@/components/common/delete-button";
import { PageContainer, PageHeader, Section } from "@/components/common/page";
import { buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { isAiConfigured } from "@/lib/ai/azure-openai";
import { deleteConversation } from "@/lib/assistant/actions";
import { buildMessageViews } from "@/lib/assistant/view";
import { getTimeZone } from "@/lib/config";
import { repository } from "@/lib/data";
import { formatTimeAgo } from "@/lib/format";
import { ALL_WORKSPACES } from "@/lib/workspaces/scope";

export const metadata: Metadata = { title: "Assistant" };

export default function AssistantPage({
  searchParams,
}: PageProps<"/assistant">) {
  return (
    <PageContainer>
      <div className="mx-auto w-full max-w-3xl space-y-8">
        <Suspense fallback={<AssistantSkeleton />}>
          <AssistantContent searchParams={searchParams} />
        </Suspense>
      </div>
    </PageContainer>
  );
}

const DESCRIPTION = "Answers from your saved tasks, across both of your jobs.";

async function AssistantContent({
  searchParams,
}: Pick<PageProps<"/assistant">, "searchParams">) {
  const { c: conversationId } = await searchParams;
  const isAvailable = isAiConfigured();

  if (typeof conversationId !== "string") {
    return (
      <>
        <PageHeader title="Assistant" description={DESCRIPTION} />
        <AssistantChat
          key="new"
          conversationId={null}
          messages={[]}
          isAvailable={isAvailable}
        />
        <RecentConversations />
      </>
    );
  }

  const conversation = await repository.getConversation(conversationId);
  if (!conversation) notFound();

  const [messages, tasks, workspaces] = await Promise.all([
    repository.listMessages(conversation.id),
    repository.listTasks(ALL_WORKSPACES),
    repository.listWorkspaces(),
  ]);

  return (
    <>
      <PageHeader
        title="Assistant"
        description={DESCRIPTION}
        actions={
          <Link
            href="/assistant"
            className={buttonVariants({ variant: "outline", size: "sm" })}
          >
            New conversation
          </Link>
        }
      />
      <AssistantChat
        key={conversation.id}
        conversationId={conversation.id}
        messages={buildMessageViews(
          messages,
          tasks,
          workspaces,
          new Date(),
          getTimeZone(),
        )}
        isAvailable={isAvailable}
      />
    </>
  );
}

async function RecentConversations() {
  const conversations = await repository.listConversations();
  if (conversations.length === 0) return null;

  const now = new Date();
  return (
    <Section title="Recent conversations">
      <ul className="divide-y rounded-lg border">
        {conversations.map(({ id, title, updatedAt }) => (
          <li key={id} className="flex items-center gap-2 pr-1">
            <Link
              href={`/assistant?c=${id}`}
              className="min-w-0 flex-1 px-3 py-2.5 text-sm hover:underline"
            >
              <span className="block truncate">{title}</span>
              <span className="text-xs text-muted-foreground">
                {formatTimeAgo(updatedAt, now)}
              </span>
            </Link>
            <DeleteButton
              label={`Delete the conversation "${title}"`}
              confirmation="Delete this conversation? Your tasks aren't affected."
              action={deleteConversation.bind(null, id)}
            />
          </li>
        ))}
      </ul>
    </Section>
  );
}

function AssistantSkeleton() {
  return (
    <div className="space-y-8" aria-hidden>
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-40 w-full" />
    </div>
  );
}
