import type { TOrganizationRole } from "@formbricks/types/memberships";
import type { TTeamRole } from "@/modules/fsinf-ce/teams/team-list/types/team";
import type { TTeamPermission } from "@/modules/fsinf-ce/teams/workspace-teams/types/team";

/**
 * FSINF CE: pure permission rules for teams. Kept free of I/O so the rules are unit-tested and the
 * server actions and the UI agree on them.
 *
 * The rules:
 *   • Organization owners and managers manage every team: name, members, workspace access, deletion.
 *   • A team admin manages the MEMBERS of their own team (add, remove, change team role). They do not
 *     change which workspaces the team reaches — otherwise a team admin could hand their team (and so
 *     themselves) `manage` on any workspace of the organization.
 *   • Contributors only see the teams they belong to; other members see none.
 */

const TEAM_PERMISSION_RANK: Record<TTeamPermission, number> = {
  read: 1,
  readWrite: 2,
  manage: 3,
};

/** The strongest permission among several team grants on the same workspace; null for none. */
export const getHighestTeamPermission = (permissions: readonly TTeamPermission[]): TTeamPermission | null => {
  let highest: TTeamPermission | null = null;
  for (const permission of permissions) {
    if (highest === null || TEAM_PERMISSION_RANK[permission] > TEAM_PERMISSION_RANK[highest]) {
      highest = permission;
    }
  }
  return highest;
};

export const isOrganizationOwnerOrManager = (role?: TOrganizationRole | null): boolean =>
  role === "owner" || role === "manager";

export interface TTeamCapabilities {
  /** May see the team at all. */
  canView: boolean;
  /** May add/remove members and change their team role. */
  canManageMembers: boolean;
  /** May rename the team, change its workspace access and delete it. */
  canManageTeam: boolean;
}

export const getTeamCapabilities = ({
  organizationRole,
  teamRole,
}: {
  organizationRole?: TOrganizationRole | null;
  teamRole?: TTeamRole | null;
}): TTeamCapabilities => {
  if (isOrganizationOwnerOrManager(organizationRole)) {
    return { canView: true, canManageMembers: true, canManageTeam: true };
  }
  // Billing users never work with product data, even if a (stale) team membership exists.
  if (organizationRole !== "member") {
    return { canView: false, canManageMembers: false, canManageTeam: false };
  }
  return {
    canView: teamRole === "admin" || teamRole === "contributor",
    canManageMembers: teamRole === "admin",
    canManageTeam: false,
  };
};

/**
 * Which organization members can be put into a team. Billing users are excluded: they cannot reach
 * workspaces, so a team membership would only be misleading.
 */
export const isEligibleTeamMember = (role: TOrganizationRole): boolean => role !== "billing";
