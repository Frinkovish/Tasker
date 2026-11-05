import type {
  AssistantConversation,
  AssistantMessage,
  AssistantProposal,
  AssistantTurn,
} from "@/lib/domain/assistant";
import type { Capture } from "@/lib/domain/capture";
import type {
  Subtask,
  Task,
  TaskActivity,
  TaskNote,
  TaskReview,
  TaskStatus,
  TaskUpdate,
} from "@/lib/domain/task";
import type {
  Project,
  ProjectInput,
  Stakeholder,
  StakeholderInput,
  Workspace,
  WorkspaceUpdate,
} from "@/lib/domain/workspace";
import type { WorkspaceScope } from "@/lib/workspaces/scope";

/** The only way the app reads and writes work data. */
export interface WorkRepository {
  listWorkspaces(): Promise<Workspace[]>;
  /** Null when the workspace doesn't exist or belongs to someone else. */
  getWorkspace(id: string): Promise<Workspace | null>;
  updateWorkspace(id: string, update: WorkspaceUpdate): Promise<void>;

  listStakeholders(scope: WorkspaceScope): Promise<Stakeholder[]>;
  createStakeholder(
    workspaceId: string,
    input: StakeholderInput,
  ): Promise<void>;
  deleteStakeholder(id: string): Promise<void>;

  listProjects(scope: WorkspaceScope): Promise<Project[]>;
  createProject(workspaceId: string, input: ProjectInput): Promise<void>;
  deleteProject(id: string): Promise<void>;

  /** Requests not yet reviewed into a task, newest first. */
  listCaptures(): Promise<Capture[]>;
  /** Null when the capture doesn't exist, has been reviewed or isn't the user's. */
  getCapture(id: string): Promise<Capture | null>;
  createCapture(text: string): Promise<void>;
  deleteCapture(id: string): Promise<void>;
  /** Creates the task and removes the capture as one operation. */
  reviewCapture(captureId: string, review: TaskReview): Promise<string>;

  listTasks(scope: WorkspaceScope): Promise<Task[]>;
  /** Null when the task doesn't exist or belongs to someone else. */
  getTask(id: string): Promise<Task | null>;
  updateTask(id: string, update: TaskUpdate): Promise<void>;
  setTaskStatus(id: string, status: TaskStatus): Promise<void>;

  listSubtasks(taskId: string): Promise<Subtask[]>;
  createSubtask(taskId: string, title: string): Promise<void>;
  setSubtaskStatus(id: string, status: Subtask["status"]): Promise<void>;
  deleteSubtask(id: string): Promise<void>;

  listNotes(taskId: string): Promise<TaskNote[]>;
  createNote(taskId: string, body: string): Promise<void>;
  deleteNote(id: string): Promise<void>;

  /** The task's history, newest first. */
  listActivity(taskId: string): Promise<TaskActivity[]>;

  /** Most recently used first. */
  listConversations(): Promise<AssistantConversation[]>;
  /** Null when it doesn't exist or belongs to someone else. */
  getConversation(id: string): Promise<AssistantConversation | null>;
  /** Oldest first, each with its proposals. */
  listMessages(conversationId: string): Promise<AssistantMessage[]>;
  /** Saves a question, its answer and any proposals as one operation. */
  recordAssistantTurn(turn: AssistantTurn): Promise<string>;
  deleteConversation(id: string): Promise<void>;

  /** Null when it doesn't exist or belongs to someone else. */
  getProposal(id: string): Promise<AssistantProposal | null>;
  /** Decides a pending proposal. False means it had already been decided. */
  claimProposal(id: string, status: "applied" | "dismissed"): Promise<boolean>;
  /** Undoes a claim, when the change it was for couldn't be made. */
  reopenProposal(id: string): Promise<void>;
}
