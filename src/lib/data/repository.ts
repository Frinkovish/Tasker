import type { Task } from "@/lib/domain/task";
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

  listTasks(scope: WorkspaceScope): Promise<Task[]>;

  listStakeholders(scope: WorkspaceScope): Promise<Stakeholder[]>;
  createStakeholder(
    workspaceId: string,
    input: StakeholderInput,
  ): Promise<void>;
  deleteStakeholder(id: string): Promise<void>;

  listProjects(scope: WorkspaceScope): Promise<Project[]>;
  createProject(workspaceId: string, input: ProjectInput): Promise<void>;
  deleteProject(id: string): Promise<void>;
}
