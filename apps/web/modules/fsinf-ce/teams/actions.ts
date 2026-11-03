"use server";

import { z } from "zod";
import { ZId } from "@formbricks/types/common";
import { AuthorizationError, OperationNotAllowedError } from "@formbricks/types/errors";
import { getMembershipRole } from "@/lib/membership/hooks/actions";
import { authenticatedActionClient } from "@/lib/utils/action-client";
import { checkAuthorizationUpdated } from "@/lib/utils/action-client/action-client-middleware";
import { getOrganizationIdFromTeamId } from "@/lib/utils/helper";
import { withAuditLogging } from "@/modules/fsinf-ce/audit-logs/lib/handler";
import { getAccessControlPermission } from "@/modules/fsinf-ce/features";
import { type TTeamCapabilities, getTeamCapabilities } from "@/modules/fsinf-ce/teams/lib/permissions";
import { getTeamRoleByTeamIdUserId } from "@/modules/fsinf-ce/teams/lib/roles";
import {
  addTeamMembers,
  createTeam,
  deleteTeam,
  getTeamDetails,
  removeTeamMember,
  removeTeamWorkspace,
  renameTeam,
  updateTeamMemberRole,
  upsertTeamWorkspace,
} from "@/modules/fsinf-ce/teams/team-list/lib/team";
import { ZTeamName, ZTeamRole } from "@/modules/fsinf-ce/teams/team-list/types/team";
import { ZTeamPermission } from "@/modules/fsinf-ce/teams/workspace-teams/types/team";

/**
 * FSINF CE: server actions for teams (organization settings → Teams, and workspace settings →
 * Team Access, which reuses the workspace-access actions below).
 *
 * The organization is always derived from the team id, never taken from the request, so a team of
 * another organization cannot be addressed by passing a different organization id.
 */

const assertAccessControlEnabled = async (organizationId: string) => {
  if (!(await getAccessControlPermission(organizationId))) {
    throw new OperationNotAllowedError("Teams are not available");
  }
};

/** Resolve the team's organization and fail unless the user holds the required capability. */
const authorizeTeam = async (
  userId: string,
  teamId: string,
  capability: keyof Pick<TTeamCapabilities, "canManageMembers" | "canManageTeam">
): Promise<string> => {
  const organizationId = await getOrganizationIdFromTeamId(teamId);
  await assertAccessControlEnabled(organizationId);

  const [organizationRole, teamRole] = await Promise.all([
    getMembershipRole(userId, organizationId), // throws for non-members
    getTeamRoleByTeamIdUserId(teamId, userId),
  ]);

  if (!getTeamCapabilities({ organizationRole, teamRole })[capability]) {
    throw new AuthorizationError("Not authorized");
  }
  return organizationId;
};

const auditTeam = async (teamId: string) => {
  const team = await getTeamDetails(teamId);
  return team ? { ...team } : null;
};

export const createTeamAction = authenticatedActionClient
  .inputSchema(z.object({ organizationId: ZId, name: ZTeamName }))
  .action(
    withAuditLogging("created", "team", async ({ ctx, parsedInput }) => {
      await checkAuthorizationUpdated({
        userId: ctx.user.id,
        organizationId: parsedInput.organizationId,
        access: [{ type: "organization", roles: ["owner", "manager"] }],
      });
      await assertAccessControlEnabled(parsedInput.organizationId);

      const team = await createTeam(parsedInput.organizationId, parsedInput.name);
      ctx.auditLoggingCtx.organizationId = parsedInput.organizationId;
      ctx.auditLoggingCtx.teamId = team.id;
      ctx.auditLoggingCtx.newObject = team;
      return team;
    })
  );

export const renameTeamAction = authenticatedActionClient
  .inputSchema(z.object({ teamId: ZId, name: ZTeamName }))
  .action(
    withAuditLogging("updated", "team", async ({ ctx, parsedInput }) => {
      const organizationId = await authorizeTeam(ctx.user.id, parsedInput.teamId, "canManageTeam");
      ctx.auditLoggingCtx.organizationId = organizationId;
      ctx.auditLoggingCtx.teamId = parsedInput.teamId;
      ctx.auditLoggingCtx.oldObject = await auditTeam(parsedInput.teamId);
      const team = await renameTeam(parsedInput.teamId, parsedInput.name);
      ctx.auditLoggingCtx.newObject = await auditTeam(parsedInput.teamId);
      return team;
    })
  );

export const deleteTeamAction = authenticatedActionClient.inputSchema(z.object({ teamId: ZId })).action(
  withAuditLogging("deleted", "team", async ({ ctx, parsedInput }) => {
    const organizationId = await authorizeTeam(ctx.user.id, parsedInput.teamId, "canManageTeam");
    ctx.auditLoggingCtx.organizationId = organizationId;
    ctx.auditLoggingCtx.teamId = parsedInput.teamId;
    ctx.auditLoggingCtx.oldObject = await auditTeam(parsedInput.teamId);
    await deleteTeam(parsedInput.teamId);
    return true;
  })
);

export const addTeamMembersAction = authenticatedActionClient
  .inputSchema(
    z.object({
      teamId: ZId,
      members: z
        .array(z.object({ userId: ZId, role: ZTeamRole }))
        .min(1)
        .max(500),
    })
  )
  .action(
    withAuditLogging("updated", "team", async ({ ctx, parsedInput }) => {
      const organizationId = await authorizeTeam(ctx.user.id, parsedInput.teamId, "canManageMembers");
      ctx.auditLoggingCtx.organizationId = organizationId;
      ctx.auditLoggingCtx.teamId = parsedInput.teamId;
      ctx.auditLoggingCtx.oldObject = await auditTeam(parsedInput.teamId);
      await addTeamMembers(parsedInput.teamId, organizationId, parsedInput.members);
      ctx.auditLoggingCtx.newObject = await auditTeam(parsedInput.teamId);
      return true;
    })
  );

export const updateTeamMemberRoleAction = authenticatedActionClient
  .inputSchema(z.object({ teamId: ZId, userId: ZId, role: ZTeamRole }))
  .action(
    withAuditLogging("updated", "team", async ({ ctx, parsedInput }) => {
      const organizationId = await authorizeTeam(ctx.user.id, parsedInput.teamId, "canManageMembers");
      ctx.auditLoggingCtx.organizationId = organizationId;
      ctx.auditLoggingCtx.teamId = parsedInput.teamId;
      ctx.auditLoggingCtx.oldObject = await auditTeam(parsedInput.teamId);
      await updateTeamMemberRole(parsedInput.teamId, parsedInput.userId, parsedInput.role);
      ctx.auditLoggingCtx.newObject = await auditTeam(parsedInput.teamId);
      return true;
    })
  );

export const removeTeamMemberAction = authenticatedActionClient
  .inputSchema(z.object({ teamId: ZId, userId: ZId }))
  .action(
    withAuditLogging("updated", "team", async ({ ctx, parsedInput }) => {
      const organizationId = await authorizeTeam(ctx.user.id, parsedInput.teamId, "canManageMembers");
      ctx.auditLoggingCtx.organizationId = organizationId;
      ctx.auditLoggingCtx.teamId = parsedInput.teamId;
      ctx.auditLoggingCtx.oldObject = await auditTeam(parsedInput.teamId);
      await removeTeamMember(parsedInput.teamId, parsedInput.userId);
      ctx.auditLoggingCtx.newObject = await auditTeam(parsedInput.teamId);
      return true;
    })
  );

/** Grant or change a team's permission on a workspace (owners/managers only). */
export const setTeamWorkspacePermissionAction = authenticatedActionClient
  .inputSchema(z.object({ teamId: ZId, workspaceId: ZId, permission: ZTeamPermission }))
  .action(
    withAuditLogging("updated", "team", async ({ ctx, parsedInput }) => {
      const organizationId = await authorizeTeam(ctx.user.id, parsedInput.teamId, "canManageTeam");
      ctx.auditLoggingCtx.organizationId = organizationId;
      ctx.auditLoggingCtx.teamId = parsedInput.teamId;
      ctx.auditLoggingCtx.workspaceId = parsedInput.workspaceId;
      ctx.auditLoggingCtx.oldObject = await auditTeam(parsedInput.teamId);
      await upsertTeamWorkspace(
        parsedInput.teamId,
        organizationId,
        parsedInput.workspaceId,
        parsedInput.permission
      );
      ctx.auditLoggingCtx.newObject = await auditTeam(parsedInput.teamId);
      return true;
    })
  );

/** Revoke a team's access to a workspace (owners/managers only). */
export const removeTeamWorkspaceAction = authenticatedActionClient
  .inputSchema(z.object({ teamId: ZId, workspaceId: ZId }))
  .action(
    withAuditLogging("updated", "team", async ({ ctx, parsedInput }) => {
      const organizationId = await authorizeTeam(ctx.user.id, parsedInput.teamId, "canManageTeam");
      ctx.auditLoggingCtx.organizationId = organizationId;
      ctx.auditLoggingCtx.teamId = parsedInput.teamId;
      ctx.auditLoggingCtx.workspaceId = parsedInput.workspaceId;
      ctx.auditLoggingCtx.oldObject = await auditTeam(parsedInput.teamId);
      await removeTeamWorkspace(parsedInput.teamId, parsedInput.workspaceId);
      ctx.auditLoggingCtx.newObject = await auditTeam(parsedInput.teamId);
      return true;
    })
  );
