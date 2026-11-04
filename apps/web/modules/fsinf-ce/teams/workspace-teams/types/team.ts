import { z } from "zod";

/**
 * FSINF CE: the permission a team holds on a workspace (Prisma `WorkspaceTeamPermission`).
 *
 * `read` < `readWrite` < `manage`; see `teams/lib/permissions.ts` for the ordering.
 */
export const ZTeamPermission = z.enum(["read", "readWrite", "manage"]);

export type TTeamPermission = z.infer<typeof ZTeamPermission>;

/** One row of the workspace "Team Access" page: a team and what it may do in this workspace. */
export const ZWorkspaceTeam = z.object({
  id: z.string(),
  name: z.string(),
  permission: ZTeamPermission,
  memberCount: z.number(),
});

export type TWorkspaceTeam = z.infer<typeof ZWorkspaceTeam>;
