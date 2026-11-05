import "server-only";

import { z } from "zod";

import { getCurrentUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { ALL_WORKSPACES, type WorkspaceScope } from "@/lib/workspaces/scope";

import { UserFacingError } from "./errors";
import type { WorkRepository } from "./repository";
import {
  parseAssistantConversation,
  parseAssistantMessage,
  parseAssistantProposal,
  parseCapture,
  parseProject,
  parseStakeholder,
  parseSubtask,
  parseTask,
  parseTaskActivity,
  parseTaskNote,
  parseWorkspace,
} from "./rows";

const WORKSPACE_COLUMNS = "id, name, description, color, created_at, updated_at";
const STAKEHOLDER_COLUMNS =
  "id, workspace_id, name, role, contact_details, created_at";
const PROJECT_COLUMNS = "id, workspace_id, name, description, status, created_at";
const CAPTURE_COLUMNS = "id, source_text, created_at";
const TASK_COLUMNS =
  "id, workspace_id, stakeholder_id, project_id, title, description, source_request, status, priority, deadline, estimated_minutes, next_action, waiting_for, created_at, updated_at, completed_at";
const SUBTASK_COLUMNS = "id, task_id, title, status, created_at, completed_at";
const NOTE_COLUMNS = "id, task_id, body, created_at";
const ACTIVITY_COLUMNS =
  "id, task_id, action, previous_value, new_value, created_at";
const CONVERSATION_COLUMNS = "id, title, created_at, updated_at";
const PROPOSAL_COLUMNS =
  "id, message_id, task_id, payload, status, created_at, resolved_at";
const MESSAGE_COLUMNS = `id, conversation_id, role, content, referenced_task_ids, created_at, assistant_proposals (${PROPOSAL_COLUMNS})`;

const CONVERSATION_LIST_LIMIT = 30;

const FOREIGN_KEY_VIOLATION = "23503";
const NOT_FOUND = "P0002";

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
  if (error.code === FOREIGN_KEY_VIOLATION) {
    return new UserFacingError(
      "That stakeholder or project isn't in this task's workspace.",
    );
  }
  return new Error(`Database error while trying to ${operation} (${error.code})`);
}

/** Postgres rejects a malformed id with an error, but to the user it's simply missing. */
const isUuid = (id: string) => z.uuid().safeParse(id).success;

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
    if (!isUuid(id)) return null;
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
    if (data.length === 0) throw new UserFacingError("This workspace no longer exists.");
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

  async listCaptures() {
    const db = await getDatabase();
    const { data, error } = await db
      .from("captures")
      .select(CAPTURE_COLUMNS)
      .order("created_at", { ascending: false });
    if (error) throw databaseError("list captures", error);
    return data.map(parseCapture);
  },

  async getCapture(id) {
    if (!isUuid(id)) return null;
    const db = await getDatabase();
    const { data, error } = await db
      .from("captures")
      .select(CAPTURE_COLUMNS)
      .eq("id", id)
      .maybeSingle();
    if (error) throw databaseError("read a capture", error);
    return data ? parseCapture(data) : null;
  },

  async createCapture(text) {
    const db = await getDatabase();
    const { error } = await db.from("captures").insert({ source_text: text });
    if (error) throw databaseError("create a capture", error);
  },

  async deleteCapture(id) {
    const db = await getDatabase();
    const { error } = await db.from("captures").delete().eq("id", id);
    if (error) throw databaseError("delete a capture", error);
  },

  async reviewCapture(captureId, review) {
    const db = await getDatabase();
    const { data, error } = await db.rpc("review_capture", {
      p_capture_id: captureId,
      p_workspace_id: review.workspaceId,
      p_stakeholder_id: review.stakeholderId,
      p_project_id: review.projectId,
      p_title: review.title,
      p_description: review.description,
      p_status: review.status,
      p_priority: review.priority,
      p_deadline: review.deadline?.toISOString() ?? null,
      p_estimated_minutes: review.estimatedMinutes,
      p_next_action: review.nextAction,
      p_waiting_for: review.waitingFor,
    });
    if (error?.code === NOT_FOUND) {
      throw new UserFacingError("This request has already been reviewed.");
    }
    if (error) throw databaseError("review a capture", error);
    return z.uuid().parse(data);
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

  async getTask(id) {
    if (!isUuid(id)) return null;
    const db = await getDatabase();
    const { data, error } = await db
      .from("tasks")
      .select(TASK_COLUMNS)
      .eq("id", id)
      .maybeSingle();
    if (error) throw databaseError("read a task", error);
    return data ? parseTask(data) : null;
  },

  async updateTask(id, update) {
    const db = await getDatabase();
    const { data, error } = await db
      .from("tasks")
      .update({
        title: update.title,
        description: update.description,
        stakeholder_id: update.stakeholderId,
        project_id: update.projectId,
        status: update.status,
        priority: update.priority,
        deadline: update.deadline?.toISOString() ?? null,
        estimated_minutes: update.estimatedMinutes,
        next_action: update.nextAction,
        waiting_for: update.waitingFor,
      })
      .eq("id", id)
      .select("id");
    if (error) throw databaseError("update a task", error);
    if (data.length === 0) throw new UserFacingError("This task no longer exists.");
  },

  async setTaskStatus(id, status) {
    const db = await getDatabase();
    const { error } = await db.from("tasks").update({ status }).eq("id", id);
    if (error) throw databaseError("change a task's status", error);
  },

  async listSubtasks(taskId) {
    const db = await getDatabase();
    const { data, error } = await db
      .from("subtasks")
      .select(SUBTASK_COLUMNS)
      .eq("task_id", taskId)
      .order("created_at");
    if (error) throw databaseError("list subtasks", error);
    return data.map(parseSubtask);
  },

  async createSubtask(taskId, title) {
    const db = await getDatabase();
    const { error } = await db.from("subtasks").insert({ task_id: taskId, title });
    if (error) throw databaseError("create a subtask", error);
  },

  async setSubtaskStatus(id, status) {
    const db = await getDatabase();
    const { error } = await db.from("subtasks").update({ status }).eq("id", id);
    if (error) throw databaseError("change a subtask's status", error);
  },

  async deleteSubtask(id) {
    const db = await getDatabase();
    const { error } = await db.from("subtasks").delete().eq("id", id);
    if (error) throw databaseError("delete a subtask", error);
  },

  async listNotes(taskId) {
    const db = await getDatabase();
    const { data, error } = await db
      .from("task_notes")
      .select(NOTE_COLUMNS)
      .eq("task_id", taskId)
      .order("created_at", { ascending: false });
    if (error) throw databaseError("list notes", error);
    return data.map(parseTaskNote);
  },

  async createNote(taskId, body) {
    const db = await getDatabase();
    const { error } = await db.from("task_notes").insert({ task_id: taskId, body });
    if (error) throw databaseError("create a note", error);
  },

  async deleteNote(id) {
    const db = await getDatabase();
    const { error } = await db.from("task_notes").delete().eq("id", id);
    if (error) throw databaseError("delete a note", error);
  },

  async listActivity(taskId) {
    const db = await getDatabase();
    const { data, error } = await db
      .from("task_activity")
      .select(ACTIVITY_COLUMNS)
      .eq("task_id", taskId)
      .order("created_at", { ascending: false });
    if (error) throw databaseError("list task history", error);
    return data.map(parseTaskActivity);
  },

  async listConversations() {
    const db = await getDatabase();
    const { data, error } = await db
      .from("assistant_conversations")
      .select(CONVERSATION_COLUMNS)
      .order("updated_at", { ascending: false })
      .limit(CONVERSATION_LIST_LIMIT);
    if (error) throw databaseError("list conversations", error);
    return data.map(parseAssistantConversation);
  },

  async getConversation(id) {
    if (!isUuid(id)) return null;
    const db = await getDatabase();
    const { data, error } = await db
      .from("assistant_conversations")
      .select(CONVERSATION_COLUMNS)
      .eq("id", id)
      .maybeSingle();
    if (error) throw databaseError("read a conversation", error);
    return data ? parseAssistantConversation(data) : null;
  },

  async listMessages(conversationId) {
    const db = await getDatabase();
    const { data, error } = await db
      .from("assistant_messages")
      .select(MESSAGE_COLUMNS)
      .eq("conversation_id", conversationId)
      .order("created_at")
      .order("created_at", { referencedTable: "assistant_proposals" });
    if (error) throw databaseError("list messages", error);
    return data.map(parseAssistantMessage);
  },

  async recordAssistantTurn(turn) {
    const db = await getDatabase();
    const { data, error } = await db.rpc("record_assistant_turn", {
      p_conversation_id: turn.conversationId,
      p_title: turn.title,
      p_user_content: turn.userContent,
      p_assistant_content: turn.assistantContent,
      p_referenced_task_ids: turn.referencedTaskIds,
      p_proposals: turn.proposals.map(({ taskId, payload }) => ({
        task_id: taskId,
        payload,
      })),
    });
    if (error?.code === NOT_FOUND) {
      throw new UserFacingError("This conversation no longer exists.");
    }
    if (error) throw databaseError("save a conversation", error);
    return z.uuid().parse(data);
  },

  async deleteConversation(id) {
    const db = await getDatabase();
    const { error } = await db
      .from("assistant_conversations")
      .delete()
      .eq("id", id);
    if (error) throw databaseError("delete a conversation", error);
  },

  async getProposal(id) {
    if (!isUuid(id)) return null;
    const db = await getDatabase();
    const { data, error } = await db
      .from("assistant_proposals")
      .select(PROPOSAL_COLUMNS)
      .eq("id", id)
      .maybeSingle();
    if (error) throw databaseError("read a proposal", error);
    return data ? parseAssistantProposal(data) : null;
  },

  async claimProposal(id, status) {
    const db = await getDatabase();
    const { data, error } = await db
      .from("assistant_proposals")
      .update({ status, resolved_at: new Date().toISOString() })
      .eq("id", id)
      .eq("status", "pending")
      .select("id");
    if (error) throw databaseError("decide on a proposal", error);
    return data.length > 0;
  },

  async reopenProposal(id) {
    const db = await getDatabase();
    const { error } = await db
      .from("assistant_proposals")
      .update({ status: "pending", resolved_at: null })
      .eq("id", id);
    if (error) throw databaseError("reopen a proposal", error);
  },
};
