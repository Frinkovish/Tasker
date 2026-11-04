import type { Metadata } from "next";

import {
  PageContainer,
  PageHeader,
  PhasePlaceholder,
} from "@/components/common/page";

export const metadata: Metadata = { title: "Assistant" };

export default function AssistantPage() {
  return (
    <PageContainer>
      <PageHeader title="Assistant" />
      <PhasePlaceholder phase={6}>
        Ask questions about your saved tasks and make changes by conversation.
      </PhasePlaceholder>
    </PageContainer>
  );
}
