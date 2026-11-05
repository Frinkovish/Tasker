// Relative imports with extensions let Node's test runner load this file.
import type { AssistantMessage } from "../domain/assistant.ts";
import type { Task } from "../domain/task.ts";
import type { Workspace } from "../domain/workspace.ts";

import { describeProposal, type ProposalRow } from "./proposals.ts";

export interface ProposalView {
  id: string;
  status: "pending" | "applied" | "dismissed";
  taskId: string;
  taskTitle: string;
  workspace: { name: string; color: string } | null;
  rows: ProposalRow[];
}

export interface MessageView {
  id: string;
  role: "user" | "assistant";
  content: string;
  /** Real tasks only, with today's titles, so the model can't produce a false link. */
  references: { id: string; title: string }[];
  proposals: ProposalView[];
}

export function buildMessageViews(
  messages: readonly AssistantMessage[],
  tasks: readonly Task[],
  workspaces: readonly Pick<Workspace, "id" | "name" | "color">[],
  now: Date,
  timeZone: string,
): MessageView[] {
  const taskById = new Map(tasks.map((task) => [task.id, task]));

  return messages.map((message) => {
    const proposals = message.proposals.flatMap((proposal): ProposalView[] => {
      const task = taskById.get(proposal.taskId);
      if (!task) return [];
      const workspace = workspaces.find(({ id }) => id === task.workspaceId);
      return [
        {
          id: proposal.id,
          status: proposal.status,
          taskId: task.id,
          taskTitle: task.title,
          workspace: workspace
            ? { name: workspace.name, color: workspace.color }
            : null,
          rows: describeProposal(proposal.payload, now, timeZone),
        },
      ];
    });
    const shownInProposal = new Set(proposals.map(({ taskId }) => taskId));

    return {
      id: message.id,
      role: message.role,
      content: message.content,
      references: [...new Set(message.referencedTaskIds)].flatMap((id) => {
        const task = taskById.get(id);
        return task && !shownInProposal.has(id)
          ? [{ id, title: task.title }]
          : [];
      }),
      proposals,
    };
  });
}
