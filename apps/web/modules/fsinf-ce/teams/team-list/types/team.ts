import { z } from "zod";
import { ZOrganizationRole } from "@formbricks/types/memberships";
import { ZTeamPermission } from "@/modules/fsinf-ce/teams/workspace-teams/types/team";

/**
 * FSINF CE: team types for organization settings.
 *
 * A team bundles organization members (`TeamUser`, role admin|contributor) and grants them access to
 * workspaces (`WorkspaceTeam`, permission read|readWrite|manage). Organization owners and managers
 * reach every workspace without a team; members reach only what their teams grant.
 */

export const ZTeamRole = z.enum(["admin", "contributor"]);

export type TTeamRole = z.infer<typeof ZTeamRole>;

/** A team as offered in pickers (invite dialog, create-workspace dialog). */
export const ZOrganizationTeam = z.object({
  id: z.string(),
  name: z.string(),
});

export type TOrganizationTeam = z.infer<typeof ZOrganizationTeam>;

/** An organization member as offered when adding people to a team. */
export const ZOrganizationMember = z.object({
  id: z.string(),
  name: z.string(),
  role: ZOrganizationRole,
});

export type TOrganizationMember = z.infer<typeof ZOrganizationMember>;

export const ZTeamMember = z.object({
  userId: z.string(),
  name: z.string(),
  email: z.string(),
  role: ZTeamRole,
});

export type TTeamMember = z.infer<typeof ZTeamMember>;

export const ZTeamWorkspace = z.object({
  workspaceId: z.string(),
  workspaceName: z.string(),
  permission: ZTeamPermission,
});

export type TTeamWorkspace = z.infer<typeof ZTeamWorkspace>;

/** A team with everything the "Manage team" dialog shows. */
export const ZTeamDetails = ZOrganizationTeam.extend({
  members: z.array(ZTeamMember),
  workspaces: z.array(ZTeamWorkspace),
});

export type TTeamDetails = z.infer<typeof ZTeamDetails>;

/** Team names are unique per organization; the Authentik sync matches them case-insensitively. */
export const ZTeamName = z.string().trim().min(1).max(100);
