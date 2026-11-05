import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { PageContainer, PageHeader, Section } from "@/components/common/page";
import {
  TaskReviewForm,
  type WorkspaceOptions,
} from "@/components/tasks/task-review-form";
import { Skeleton } from "@/components/ui/skeleton";
import {
  extractTaskDetails,
  type ExtractionResult,
} from "@/lib/ai/extraction/extract";
import { repository } from "@/lib/data";
import type { Capture } from "@/lib/domain/capture";
import { ALL_WORKSPACES } from "@/lib/workspaces/scope";

export const metadata: Metadata = { title: "Review request" };

export default function ReviewPage({
  params,
  searchParams,
}: PageProps<"/inbox/[id]">) {
  return (
    <PageContainer>
      <Link
        href="/inbox"
        className="inline-flex min-h-(--control-h-sm) items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" aria-hidden />
        Inbox
      </Link>
      <Suspense fallback={<Skeleton className="h-96 w-full" />}>
        <ReviewContent params={params} searchParams={searchParams} />
      </Suspense>
    </PageContainer>
  );
}

async function ReviewContent({
  params,
  searchParams,
}: Pick<PageProps<"/inbox/[id]">, "params" | "searchParams">) {
  const [{ id }, { manual }] = await Promise.all([params, searchParams]);
  const capture = await repository.getCapture(id);
  if (!capture) notFound();

  return (
    <>
      <PageHeader
        title="Review request"
        description="Check the details, then save. Only a title and workspace are required."
      />
      <Section title="Original request">
        <blockquote className="rounded-lg border-l-2 bg-muted/50 px-4 py-3 text-sm break-words whitespace-pre-wrap">
          {capture.sourceText}
        </blockquote>
      </Section>
      {/* The request shows straight away, and AI can't hold up the page. */}
      <Suspense fallback={<ReadingRequest captureId={capture.id} />}>
        <ReviewForm capture={capture} useAi={manual !== "1"} />
      </Suspense>
    </>
  );
}

function ReadingRequest({ captureId }: { captureId: string }) {
  return (
    <div className="space-y-4">
      <p role="status" className="text-sm text-muted-foreground">
        Reading your request…{" "}
        <Link
          href={`/inbox/${captureId}?manual=1`}
          className="text-foreground underline underline-offset-4"
        >
          Fill it in myself
        </Link>
      </p>
      <Skeleton className="h-96 w-full" />
    </div>
  );
}

const AI_STATUS_MESSAGES: Partial<Record<ExtractionResult["status"], string>> = {
  failed: "AI suggestions aren't available right now, so fill this in yourself.",
  unavailable: "AI suggestions aren't set up, so fill this in yourself.",
};

async function ReviewForm({
  capture,
  useAi,
}: {
  capture: Capture;
  useAi: boolean;
}) {
  const [workspaces, stakeholders, projects, result] = await Promise.all([
    repository.listWorkspaces(),
    repository.listStakeholders(ALL_WORKSPACES),
    repository.listProjects(ALL_WORKSPACES),
    useAi ? extractTaskDetails(capture.sourceText) : null,
  ]);

  const options: WorkspaceOptions[] = workspaces.map((workspace) => ({
    id: workspace.id,
    name: workspace.name,
    stakeholders: stakeholders
      .filter((item) => item.workspaceId === workspace.id)
      .map(({ id, name }) => ({ id, name })),
    projects: projects
      .filter((item) => item.workspaceId === workspace.id)
      .map(({ id, name }) => ({ id, name })),
  }));
  const statusMessage = result ? AI_STATUS_MESSAGES[result.status] : undefined;

  return (
    <div className="space-y-4">
      {statusMessage && (
        <p role="status" className="text-sm text-muted-foreground">
          {statusMessage}
        </p>
      )}
      <TaskReviewForm
        captureId={capture.id}
        workspaces={options}
        suggestion={result?.status === "ready" ? result.extraction : undefined}
      />
    </div>
  );
}
