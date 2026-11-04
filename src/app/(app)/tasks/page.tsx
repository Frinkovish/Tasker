import type { Metadata } from "next";

import {
  PageContainer,
  PageHeader,
  PhasePlaceholder,
} from "@/components/common/page";

export const metadata: Metadata = { title: "Tasks" };

export default function TasksPage() {
  return (
    <PageContainer>
      <PageHeader title="Tasks" />
      <PhasePlaceholder phase={3}>
        Search, filter and edit tasks across both workspaces.
      </PhasePlaceholder>
    </PageContainer>
  );
}
