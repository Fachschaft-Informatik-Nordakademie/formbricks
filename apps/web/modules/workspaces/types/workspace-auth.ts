import { z } from "zod";
import type { Session } from "@formbricks/types/auth";
import { TMembership, ZMembership } from "@formbricks/types/memberships";
import { TOrganization, ZOrganization } from "@formbricks/types/organizations";
import { TUser, ZUser } from "@formbricks/types/user";
import { TWorkspace, ZWorkspace } from "@formbricks/types/workspace";
import { TTeamPermission, ZTeamPermission } from "@/modules/fsinf-ce/teams/workspace-teams/types/team";

export const ZWorkspaceAuth = z.object({
  workspace: ZWorkspace,
  organization: ZOrganization,
  session: z.object({
    user: ZUser.pick({ id: true }),
    expires: z.string(),
  }),
  currentUserMembership: ZMembership,
  workspacePermission: ZTeamPermission.nullable(),
  isMember: z.boolean(),
  isOwner: z.boolean(),
  isManager: z.boolean(),
  isBilling: z.boolean(),
  hasReadAccess: z.boolean(),
  hasReadWriteAccess: z.boolean(),
  hasManageAccess: z.boolean(),
  isReadOnly: z.boolean(),
});

export type TWorkspaceAuth = z.infer<typeof ZWorkspaceAuth>;

/**
 * Complete layout data type for workspace pages.
 * Includes all data needed for layout rendering.
 *
 * Note: organizations and workspaces lists are NOT included - they are lazy-loaded
 * in switcher dropdowns only when needed.
 */
export type TWorkspaceLayoutData = {
  session: Session;
  user: TUser;
  workspace: TWorkspace; // Current workspace with full details
  organization: TOrganization;
  membership: TMembership;
  isAccessControlAllowed: boolean;
  workspacePermission: TTeamPermission | null;
  /** FSINF CE: replaces the EE license object; see modules/fsinf-ce/features. */
  isMultiOrgEnabled: boolean;
  responseCount: number;
};
