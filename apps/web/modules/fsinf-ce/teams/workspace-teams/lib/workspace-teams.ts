import "server-only";
import { cache as reactCache } from "react";
import { prisma } from "@formbricks/database";
import { Prisma } from "@formbricks/database/prisma";
import { logger } from "@formbricks/logger";
import { ZId } from "@formbricks/types/common";
import { DatabaseError } from "@formbricks/types/errors";
import { validateInputs } from "@/lib/utils/validate";
import type { TWorkspaceTeam } from "@/modules/fsinf-ce/teams/workspace-teams/types/team";

/** FSINF CE: the teams that can access one workspace, with their permission (workspace "Team Access"). */
export const getTeamsByWorkspaceId = reactCache(async (workspaceId: string): Promise<TWorkspaceTeam[]> => {
  validateInputs([workspaceId, ZId]);
  try {
    const workspaceTeams = await prisma.workspaceTeam.findMany({
      where: { workspaceId },
      select: {
        permission: true,
        team: { select: { id: true, name: true, _count: { select: { teamUsers: true } } } },
      },
    });
    return workspaceTeams
      .map((workspaceTeam) => ({
        id: workspaceTeam.team.id,
        name: workspaceTeam.team.name,
        permission: workspaceTeam.permission,
        memberCount: workspaceTeam.team._count.teamUsers,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      logger.error(error, "Error getting workspace teams");
      throw new DatabaseError(error.message);
    }
    throw error;
  }
});
