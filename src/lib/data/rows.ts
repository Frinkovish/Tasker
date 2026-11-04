// Relative imports with extensions let Node's test runner load this file.
import { taskSchema, type Task } from "../domain/task.ts";
import {
  projectSchema,
  stakeholderSchema,
  workspaceSchema,
  type Project,
  type Stakeholder,
  type Workspace,
} from "../domain/workspace.ts";

const DATE_COLUMNS = new Set([
  "created_at",
  "updated_at",
  "completed_at",
  "deadline",
]);

const toCamelCase = (column: string) =>
  column.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase());

/** Converts a database row to the domain's naming, with real Date values. */
function toDomainShape(row: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(row).map(([column, value]) => [
      toCamelCase(column),
      DATE_COLUMNS.has(column) && typeof value === "string"
        ? new Date(value)
        : value,
    ]),
  );
}

/*
 * Each parser validates at the boundary, so a schema that has drifted from the
 * code fails loudly here rather than as bad data somewhere in the UI.
 */
export const parseWorkspace = (row: Record<string, unknown>): Workspace =>
  workspaceSchema.parse(toDomainShape(row));

export const parseStakeholder = (row: Record<string, unknown>): Stakeholder =>
  stakeholderSchema.parse(toDomainShape(row));

export const parseProject = (row: Record<string, unknown>): Project =>
  projectSchema.parse(toDomainShape(row));

export const parseTask = (row: Record<string, unknown>): Task =>
  taskSchema.parse(toDomainShape(row));
