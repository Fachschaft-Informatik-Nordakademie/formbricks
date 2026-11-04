import "server-only";
import { cache as reactCache } from "react";
import { prisma } from "@formbricks/database";
import { Prisma } from "@formbricks/database/prisma";
import { logger } from "@formbricks/logger";
import { ZId } from "@formbricks/types/common";
import { DatabaseError } from "@formbricks/types/errors";
import { validateInputs } from "@/lib/utils/validate";
import { getHighestTeamPermission } from "@/modules/fsinf-ce/teams/lib/permissions";
import type { TTeamRole } from "@/modules/fsinf-ce/teams/team-list/types/team";
import type { TTeamPermission } from "@/modules/fsinf-ce/teams/workspace-teams/types/team";

/**
 * FSINF CE: role lookups that the authorization middleware and settings pages build on.
 *
 * All three read the same tables the Authentik team sync writes (`TeamUser`, `WorkspaceTeam`), so a
 * team filled by `fsinf-team-sync.ts` grants exactly what these functions report.
 */

const rethrowAsDatabaseError = (error: unknown, message: string): never => {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    logger.error(error, message);
    throw new DatabaseError(error.message);
  }
  throw error;
};

/** The user's role in one team, or null when they are not in it. */
export const getTeamRoleByTeamIdUserId = reactCache(
  async (teamId: string, userId: string): Promise<TTeamRole | null> => {
    validateInputs([teamId, ZId], [userId, ZId]);
    try {
      const teamUser = await prisma.teamUser.findUnique({
        where: { teamId_userId: { teamId, userId } },
        select: { role: true },
      });
      return teamUser?.role ?? null;
    } catch (error) {
      return rethrowAsDatabaseError(error, "Error getting team role");
    }
  }
);

/** Ids of the teams in this organization in which the user is a team admin. */
export const getTeamsWhereUserIsAdmin = reactCache(
  async (userId: string, organizationId: string): Promise<string[]> => {
    validateInputs([userId, ZId], [organizationId, ZId]);
    try {
      const teamUsers = await prisma.teamUser.findMany({
        where: { userId, role: "admin", team: { organizationId } },
        select: { teamId: true },
      });
      return teamUsers.map((teamUser) => teamUser.teamId);
    } catch (error) {
      return rethrowAsDatabaseError(error, "Error getting admin teams");
    }
  }
);

/**
 * The strongest permission any of the user's teams holds on the workspace, or null when no team of
 * theirs reaches it. Owners and managers are not resolved here — their access does not come from
 * teams, and the callers check the organization role separately.
 */
export const getWorkspacePermissionByUserId = reactCache(
  async (userId: string, workspaceId: string): Promise<TTeamPermission | null> => {
    validateInputs([userId, ZId], [workspaceId, ZId]);
    try {
      const workspaceTeams = await prisma.workspaceTeam.findMany({
        where: { workspaceId, team: { teamUsers: { some: { userId } } } },
        select: { permission: true },
      });
      return getHighestTeamPermission(workspaceTeams.map((workspaceTeam) => workspaceTeam.permission));
    } catch (error) {
      return rethrowAsDatabaseError(error, "Error getting workspace permission");
    }
  }
);
