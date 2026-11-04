import { z } from "zod";

const WORKSPACE_NAME_MAX = 60;
const WORKSPACE_DESCRIPTION_MAX = 280;
const STAKEHOLDER_NAME_MAX = 120;
const STAKEHOLDER_ROLE_MAX = 120;
const CONTACT_DETAILS_MAX = 280;
const PROJECT_NAME_MAX = 120;
const PROJECT_DESCRIPTION_MAX = 1000;

const workspaceNameSchema = z
  .string()
  .trim()
  .min(1, "Enter a name.")
  .max(WORKSPACE_NAME_MAX, `Keep the name under ${WORKSPACE_NAME_MAX} characters.`);
const workspaceDescriptionSchema = z
  .string()
  .trim()
  .max(
    WORKSPACE_DESCRIPTION_MAX,
    `Keep the description under ${WORKSPACE_DESCRIPTION_MAX} characters.`,
  );
const workspaceColorSchema = z
  .string()
  .regex(/^#[0-9a-fA-F]{6}$/, "Choose a valid colour.");

export const workspaceSchema = z.object({
  id: z.uuid(),
  name: workspaceNameSchema,
  description: workspaceDescriptionSchema,
  /** Hex colour used as the workspace's visual identifier. */
  color: workspaceColorSchema,
  createdAt: z.date(),
  updatedAt: z.date(),
});
export type Workspace = z.infer<typeof workspaceSchema>;

export const workspaceUpdateSchema = z.object({
  name: workspaceNameSchema,
  description: workspaceDescriptionSchema,
  color: workspaceColorSchema,
});
export type WorkspaceUpdate = z.infer<typeof workspaceUpdateSchema>;

export const stakeholderSchema = z.object({
  id: z.uuid(),
  workspaceId: z.uuid(),
  name: z.string().trim().min(1).max(STAKEHOLDER_NAME_MAX),
  role: z.string().trim().max(STAKEHOLDER_ROLE_MAX).nullable(),
  contactDetails: z.string().trim().max(CONTACT_DETAILS_MAX).nullable(),
  createdAt: z.date(),
});
export type Stakeholder = z.infer<typeof stakeholderSchema>;

/** An empty form field means "not provided", which is stored as null. */
const optionalText = (max: number, message: string) =>
  z
    .string()
    .trim()
    .max(max, message)
    .transform((value) => value || null);

export const stakeholderInputSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Enter a name.")
    .max(STAKEHOLDER_NAME_MAX, `Keep the name under ${STAKEHOLDER_NAME_MAX} characters.`),
  role: optionalText(
    STAKEHOLDER_ROLE_MAX,
    `Keep the role under ${STAKEHOLDER_ROLE_MAX} characters.`,
  ),
  contactDetails: optionalText(
    CONTACT_DETAILS_MAX,
    `Keep contact details under ${CONTACT_DETAILS_MAX} characters.`,
  ),
});
export type StakeholderInput = z.infer<typeof stakeholderInputSchema>;

export const PROJECT_STATUSES = [
  "active",
  "on_hold",
  "completed",
  "archived",
] as const;
export const projectStatusSchema = z.enum(PROJECT_STATUSES);
export type ProjectStatus = z.infer<typeof projectStatusSchema>;

export const PROJECT_STATUS_LABELS: Record<ProjectStatus, string> = {
  active: "Active",
  on_hold: "On hold",
  completed: "Completed",
  archived: "Archived",
};

export const projectSchema = z.object({
  id: z.uuid(),
  workspaceId: z.uuid(),
  name: z.string().trim().min(1).max(PROJECT_NAME_MAX),
  description: z.string().trim().max(PROJECT_DESCRIPTION_MAX),
  status: projectStatusSchema,
  createdAt: z.date(),
});
export type Project = z.infer<typeof projectSchema>;

export const projectInputSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Enter a name.")
    .max(PROJECT_NAME_MAX, `Keep the name under ${PROJECT_NAME_MAX} characters.`),
  description: z
    .string()
    .trim()
    .max(
      PROJECT_DESCRIPTION_MAX,
      `Keep the description under ${PROJECT_DESCRIPTION_MAX} characters.`,
    ),
});
export type ProjectInput = z.infer<typeof projectInputSchema>;
