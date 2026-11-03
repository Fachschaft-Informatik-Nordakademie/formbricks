import "server-only";
import { cache as reactCache } from "react";
import { prisma } from "@formbricks/database";
import { Prisma } from "@formbricks/database/prisma";
import { logger } from "@formbricks/logger";
import { ZId } from "@formbricks/types/common";
import { DatabaseError, InvalidInputError, ResourceNotFoundError } from "@formbricks/types/errors";
import { validateInputs } from "@/lib/utils/validate";
import { isEligibleTeamMember } from "@/modules/fsinf-ce/teams/lib/permissions";
import {
  type TOrganizationTeam,
  type TTeamDetails,
  type TTeamMember,
  type TTeamRole,
  ZTeamName,
} from "@/modules/fsinf-ce/teams/team-list/types/team";
import type { TOrganizationWorkspace } from "@/modules/fsinf-ce/teams/team-list/types/workspace";
import type { TTeamPermission } from "@/modules/fsinf-ce/teams/workspace-teams/types/team";

/**
 * FSINF CE: team data access for organization settings.
 *
 * Every function is scoped by organization (or by a team id whose organization the caller has already
 * authorized). Authorization itself lives in the server actions; this file only reads and writes.
 */

const handleError = (error: unknown, message: string): never => {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    // P2002: unique constraint (organizationId, name) — a team with that name exists already.
    if (error.code === "P2002") {
      throw new InvalidInputError("A team with this name already exists");
    }
    logger.error(error, message);
    throw new DatabaseError(error.message);
  }
  throw error;
};

/** All teams of the organization, alphabetically (pickers in invite / create-workspace dialogs). */
export const getTeamsByOrganizationId = reactCache(
  async (organizationId: string): Promise<TOrganizationTeam[]> => {
    validateInputs([organizationId, ZId]);
    try {
      return await prisma.team.findMany({
        where: { organizationId },
        select: { id: true, name: true },
        orderBy: { name: "asc" },
      });
    } catch (error) {
      return handleError(error, "Error getting teams");
    }
  }
);

const teamDetailsSelect = {
  id: true,
  name: true,
  teamUsers: {
    select: { userId: true, role: true, user: { select: { name: true, email: true } } },
  },
  workspaceTeams: {
    select: { workspaceId: true, permission: true, workspace: { select: { name: true } } },
  },
} satisfies Prisma.TeamSelect;

type TTeamDetailsRow = Prisma.TeamGetPayload<{ select: typeof teamDetailsSelect }>;

const toTeamDetails = (team: TTeamDetailsRow): TTeamDetails => ({
  id: team.id,
  name: team.name,
  members: team.teamUsers
    .map((teamUser) => ({
      userId: teamUser.userId,
      name: teamUser.user.name,
      email: teamUser.user.email,
      role: teamUser.role,
    }))
    .sort((a, b) => a.name.localeCompare(b.name)),
  workspaces: team.workspaceTeams
    .map((workspaceTeam) => ({
      workspaceId: workspaceTeam.workspaceId,
      workspaceName: workspaceTeam.workspace.name,
      permission: workspaceTeam.permission,
    }))
    .sort((a, b) => a.workspaceName.localeCompare(b.workspaceName)),
});

/**
 * Teams with members and workspace access. With `onlyForUserId` set, only the teams that user belongs
 * to are returned — that is what an ordinary member may see.
 */
export const getTeamDetailsByOrganizationId = reactCache(
  async (organizationId: string, onlyForUserId?: string): Promise<TTeamDetails[]> => {
    validateInputs([organizationId, ZId]);
    try {
      const teams = await prisma.team.findMany({
        where: {
          organizationId,
          ...(onlyForUserId ? { teamUsers: { some: { userId: onlyForUserId } } } : {}),
        },
        select: teamDetailsSelect,
        orderBy: { name: "asc" },
      });
      return teams.map(toTeamDetails);
    } catch (error) {
      return handleError(error, "Error getting team details");
    }
  }
);

export const getOrganizationWorkspaces = reactCache(
  async (organizationId: string): Promise<TOrganizationWorkspace[]> => {
    validateInputs([organizationId, ZId]);
    try {
      return await prisma.workspace.findMany({
        where: { organizationId },
        select: { id: true, name: true },
        orderBy: { name: "asc" },
      });
    } catch (error) {
      return handleError(error, "Error getting workspaces");
    }
  }
);

/** Organization members who can be put into a team (everyone but billing users), by name. */
export const getTeamEligibleMembers = reactCache(
  async (organizationId: string): Promise<Omit<TTeamMember, "role">[]> => {
    validateInputs([organizationId, ZId]);
    try {
      const memberships = await prisma.membership.findMany({
        where: { organizationId, role: { not: "billing" } },
        select: { userId: true, user: { select: { name: true, email: true } } },
      });
      return memberships
        .map((membership) => ({
          userId: membership.userId,
          name: membership.user.name,
          email: membership.user.email,
        }))
        .sort((a, b) => a.name.localeCompare(b.name));
    } catch (error) {
      return handleError(error, "Error getting organization members");
    }
  }
);

export const createTeam = async (organizationId: string, name: string): Promise<TOrganizationTeam> => {
  const teamName = ZTeamName.parse(name);
  try {
    return await prisma.team.create({
      data: { organizationId, name: teamName },
      select: { id: true, name: true },
    });
  } catch (error) {
    return handleError(error, "Error creating team");
  }
};

export const getTeamDetails = async (teamId: string): Promise<TTeamDetails | null> => {
  try {
    const team = await prisma.team.findUnique({ where: { id: teamId }, select: teamDetailsSelect });
    return team ? toTeamDetails(team) : null;
  } catch (error) {
    return handleError(error, "Error getting team");
  }
};

export const renameTeam = async (teamId: string, name: string): Promise<TOrganizationTeam> => {
  const teamName = ZTeamName.parse(name);
  try {
    return await prisma.team.update({
      where: { id: teamId },
      data: { name: teamName },
      select: { id: true, name: true },
    });
  } catch (error) {
    return handleError(error, "Error renaming team");
  }
};

export const deleteTeam = async (teamId: string): Promise<void> => {
  try {
    // TeamUser and WorkspaceTeam rows cascade with the team.
    await prisma.team.delete({ where: { id: teamId } });
  } catch (error) {
    handleError(error, "Error deleting team");
  }
};

/**
 * Add members to a team. Every user must be a (non-billing) member of the team's organization —
 * checked here so a crafted request cannot pull an outsider into a team.
 */
export const addTeamMembers = async (
  teamId: string,
  organizationId: string,
  members: { userId: string; role: TTeamRole }[]
): Promise<void> => {
  if (members.length === 0) return;
  const userIds = members.map((member) => member.userId);
  if (new Set(userIds).size !== userIds.length) {
    throw new InvalidInputError("Duplicate members");
  }
  try {
    const memberships = await prisma.membership.findMany({
      where: { organizationId, userId: { in: userIds } },
      select: { userId: true, role: true },
    });
    const eligible = new Set(
      memberships.filter((membership) => isEligibleTeamMember(membership.role)).map((m) => m.userId)
    );
    if (userIds.some((userId) => !eligible.has(userId))) {
      throw new InvalidInputError("Only members of this organization can be added to its teams");
    }
    await prisma.teamUser.createMany({
      data: members.map((member) => ({ teamId, userId: member.userId, role: member.role })),
      skipDuplicates: true,
    });
  } catch (error) {
    handleError(error, "Error adding team members");
  }
};

export const updateTeamMemberRole = async (teamId: string, userId: string, role: TTeamRole) => {
  try {
    await prisma.teamUser.update({ where: { teamId_userId: { teamId, userId } }, data: { role } });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
      throw new ResourceNotFoundError("Team member", userId);
    }
    handleError(error, "Error updating team member role");
  }
};

export const removeTeamMember = async (teamId: string, userId: string): Promise<void> => {
  try {
    await prisma.teamUser.deleteMany({ where: { teamId, userId } });
  } catch (error) {
    handleError(error, "Error removing team member");
  }
};

/**
 * Grant or change a team's permission on a workspace. The workspace must belong to the team's
 * organization.
 */
export const upsertTeamWorkspace = async (
  teamId: string,
  organizationId: string,
  workspaceId: string,
  permission: TTeamPermission
): Promise<void> => {
  try {
    const workspace = await prisma.workspace.findFirst({
      where: { id: workspaceId, organizationId },
      select: { id: true },
    });
    if (!workspace) {
      throw new ResourceNotFoundError("Workspace", workspaceId);
    }
    await prisma.workspaceTeam.upsert({
      where: { workspaceId_teamId: { workspaceId, teamId } },
      create: { workspaceId, teamId, permission },
      update: { permission },
    });
  } catch (error) {
    handleError(error, "Error updating team workspace access");
  }
};

export const removeTeamWorkspace = async (teamId: string, workspaceId: string): Promise<void> => {
  try {
    await prisma.workspaceTeam.deleteMany({ where: { teamId, workspaceId } });
  } catch (error) {
    handleError(error, "Error removing team workspace access");
  }
};
