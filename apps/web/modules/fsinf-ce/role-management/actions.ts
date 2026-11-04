"use server";

import { z } from "zod";
import { ZId, ZUuid } from "@formbricks/types/common";
import { OperationNotAllowedError } from "@formbricks/types/errors";
import { ZOrganizationRole } from "@formbricks/types/memberships";
import { IS_FORMBRICKS_CLOUD } from "@/lib/constants";
import { getMembershipRole } from "@/lib/membership/hooks/actions";
import { authenticatedActionClient } from "@/lib/utils/action-client";
import { checkAuthorizationUpdated } from "@/lib/utils/action-client/action-client-middleware";
import { withAuditLogging } from "@/modules/fsinf-ce/audit-logs/lib/handler";
import { getAccessControlPermission } from "@/modules/fsinf-ce/features";
import { updateInviteRole, updateMembershipRole } from "@/modules/fsinf-ce/role-management/lib/membership";

/**
 * FSINF CE: organization role management (owner / manager / member / billing).
 */

/** Throws unless organization roles may be managed in this organization (the access-control feature). */
export const checkRoleManagementPermission = async (organizationId: string): Promise<void> => {
  if (!(await getAccessControlPermission(organizationId))) {
    throw new OperationNotAllowedError("Role management is not allowed for this organization");
  }
};

const authorizeRoleChange = async (userId: string, organizationId: string) => {
  await checkAuthorizationUpdated({
    userId,
    organizationId,
    access: [{ type: "organization", roles: ["owner", "manager"] }],
  });
  await checkRoleManagementPermission(organizationId);
  return getMembershipRole(userId, organizationId);
};

export const updateMembershipAction = authenticatedActionClient
  .inputSchema(
    z.object({
      userId: ZId,
      organizationId: ZId,
      data: z.object({ role: ZOrganizationRole }),
    })
  )
  .action(
    withAuditLogging("updated", "membership", async ({ ctx, parsedInput }) => {
      const actorRole = await authorizeRoleChange(ctx.user.id, parsedInput.organizationId);

      const { before, after } = await updateMembershipRole({
        organizationId: parsedInput.organizationId,
        actorUserId: ctx.user.id,
        actorRole,
        targetUserId: parsedInput.userId,
        newRole: parsedInput.data.role,
        isFormbricksCloud: IS_FORMBRICKS_CLOUD,
      });

      ctx.auditLoggingCtx.organizationId = parsedInput.organizationId;
      ctx.auditLoggingCtx.membershipId = `${parsedInput.userId}-${parsedInput.organizationId}`;
      ctx.auditLoggingCtx.oldObject = before;
      ctx.auditLoggingCtx.newObject = after;
      return after;
    })
  );

export const updateInviteAction = authenticatedActionClient
  .inputSchema(
    z.object({
      inviteId: ZUuid,
      organizationId: ZId,
      data: z.object({ role: ZOrganizationRole }),
    })
  )
  .action(
    withAuditLogging("updated", "invite", async ({ ctx, parsedInput }) => {
      const actorRole = await authorizeRoleChange(ctx.user.id, parsedInput.organizationId);

      // Scoped by organization inside: an invite of another organization is "not found".
      const { before, after } = await updateInviteRole({
        organizationId: parsedInput.organizationId,
        inviteId: parsedInput.inviteId,
        actorRole,
        newRole: parsedInput.data.role,
        isFormbricksCloud: IS_FORMBRICKS_CLOUD,
      });

      ctx.auditLoggingCtx.organizationId = parsedInput.organizationId;
      ctx.auditLoggingCtx.inviteId = parsedInput.inviteId;
      ctx.auditLoggingCtx.oldObject = before;
      ctx.auditLoggingCtx.newObject = after;
      return after;
    })
  );
