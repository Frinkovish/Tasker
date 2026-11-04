import type { Workspace } from "@/lib/domain/workspace";

/** The workspace fields the navigation needs on the client. */
export type WorkspaceOption = Pick<Workspace, "id" | "name" | "color">;
