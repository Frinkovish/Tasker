import "server-only";

import { z } from "zod";

import { getCurrentUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { ALL_WORKSPACES, type WorkspaceScope } from "@/lib/workspaces/scope";

import type { WorkRepository } from "./repository";
import {
  parseProject,
  parseStakeholder,
  parseTask,
  parseWorkspace,
} from "./rows";

const WORKSPACE_COLUMNS = "id, name, description, color, created_at, updated_at";
const STAKEHOLDER_COLUMNS =
  "id, workspace_id, name, role, contact_details, created_at";
const PROJECT_COLUMNS = "id, workspace_id, name, description, status, created_at";
const TASK_COLUMNS =
  "id, workspace_id, stakeholder_id, project_id, title, description, source_request, status, priority, deadline, estimated_minutes, next_action, waiting_for, created_at, updated_at, completed_at";

/**
 * Every operation goes through here. Signed-out requests are redirected before
 * touching data, and the client acts as the user, so Row Level Security limits
 * each query to their own rows.
 */
async function getDatabase() {
  await getCurrentUser();
  return createClient();
}

/** Keeps the database's message out of anything the user could see. */
function databaseError(operation: string, error: { code?: string }): Error {
  return new Error(`Database error while trying to ${operation} (${error.code})`);
}

const inScope = (scope: WorkspaceScope) =>
  scope === ALL_WORKSPACES ? null : scope;

export const supabaseRepository: WorkRepository = {
  async listWorkspaces() {
    const db = await getDatabase();
    const { data, error } = await db
      .from("workspaces")
      .select(WORKSPACE_COLUMNS)
      .order("slot");
    if (error) throw databaseError("list workspaces", error);
    return data.map(parseWorkspace);
  },

  async getWorkspace(id) {
    // Postgres rejects a malformed id with an error, but to the user it's
    // simply a workspace that doesn't exist.
    if (!z.uuid().safeParse(id).success) return null;

    const db = await getDatabase();
    const { data, error } = await db
      .from("workspaces")
      .select(WORKSPACE_COLUMNS)
      .eq("id", id)
      .maybeSingle();
    if (error) throw databaseError("read a workspace", error);
    return data ? parseWorkspace(data) : null;
  },

  async updateWorkspace(id, update) {
    const db = await getDatabase();
    const { data, error } = await db
      .from("workspaces")
      .update(update)
      .eq("id", id)
      .select("id");
    if (error) throw databaseError("update a workspace", error);
    if (data.length === 0) throw new Error("Workspace not found.");
  },

  async listTasks(scope) {
    const db = await getDatabase();
    const workspaceId = inScope(scope);
    const query = db
      .from("tasks")
      .select(TASK_COLUMNS)
      .order("created_at", { ascending: false });
    const { data, error } = await (workspaceId
      ? query.eq("workspace_id", workspaceId)
      : query);
    if (error) throw databaseError("list tasks", error);
    return data.map(parseTask);
  },

  async listStakeholders(scope) {
    const db = await getDatabase();
    const workspaceId = inScope(scope);
    const query = db.from("stakeholders").select(STAKEHOLDER_COLUMNS).order("name");
    const { data, error } = await (workspaceId
      ? query.eq("workspace_id", workspaceId)
      : query);
    if (error) throw databaseError("list stakeholders", error);
    return data.map(parseStakeholder);
  },

  async createStakeholder(workspaceId, input) {
    const db = await getDatabase();
    const { error } = await db.from("stakeholders").insert({
      workspace_id: workspaceId,
      name: input.name,
      role: input.role,
      contact_details: input.contactDetails,
    });
    if (error) throw databaseError("create a stakeholder", error);
  },

  async deleteStakeholder(id) {
    const db = await getDatabase();
    const { error } = await db.from("stakeholders").delete().eq("id", id);
    if (error) throw databaseError("delete a stakeholder", error);
  },

  async listProjects(scope) {
    const db = await getDatabase();
    const workspaceId = inScope(scope);
    const query = db.from("projects").select(PROJECT_COLUMNS).order("name");
    const { data, error } = await (workspaceId
      ? query.eq("workspace_id", workspaceId)
      : query);
    if (error) throw databaseError("list projects", error);
    return data.map(parseProject);
  },

  async createProject(workspaceId, input) {
    const db = await getDatabase();
    const { error } = await db.from("projects").insert({
      workspace_id: workspaceId,
      name: input.name,
      description: input.description,
    });
    if (error) throw databaseError("create a project", error);
  },

  async deleteProject(id) {
    const db = await getDatabase();
    const { error } = await db.from("projects").delete().eq("id", id);
    if (error) throw databaseError("delete a project", error);
  },
};
