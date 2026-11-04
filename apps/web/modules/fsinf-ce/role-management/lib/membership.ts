import "server-only";
import { prisma } from "@formbricks/database";
import { Prisma } from "@formbricks/database/prisma";
import { logger } from "@formbricks/logger";
import {
  DatabaseError,
  OperationNotAllowedError,
  ResourceNotFoundError,
  ValidationError,
} from "@formbricks/types/errors";
import type { TMembership, TOrganizationRole } from "@formbricks/types/memberships";
import { type TRoleChangeError, validateRoleChange } from "@/modules/fsinf-ce/role-management/lib/role-rules";

/**
 * FSINF CE: organization role changes for memberships and pending invites.
 *
 * The rules come from `role-rules.ts`; this file loads the facts they need inside a transaction, so
 * the last-owner check and the write see the same state.
 */

const ROLE_CHANGE_MESSAGES: Record<TRoleChangeError, string> = {
  not_authorized: "Only organization owners and managers can change roles",
  cannot_change_own_role: "You cannot change your own role",
  cannot_change_owner: "Managers cannot change the role of an owner",
  role_not_assignable: "You are not allowed to assign this role",
  last_owner: "The organization needs at least one owner",
};

const throwRoleChangeError = (error: TRoleChangeError): never => {
  if (error === "last_owner") throw new ValidationError(ROLE_CHANGE_MESSAGES[error]);
  throw new OperationNotAllowedError(ROLE_CHANGE_MESSAGES[error]);
};

const rethrow = (error: unknown, message: string): never => {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    logger.error(error, message);
    throw new DatabaseError(error.message);
  }
  throw error;
};

export const updateMembershipRole = async ({
  organizationId,
  actorUserId,
  actorRole,
  targetUserId,
  newRole,
  isFormbricksCloud,
}: {
  organizationId: string;
  actorUserId: string;
  actorRole: TOrganizationRole;
  targetUserId: string;
  newRole: TOrganizationRole;
  isFormbricksCloud: boolean;
}): Promise<{ before: TMembership; after: TMembership }> => {
  try {
    return await prisma.$transaction(async (tx) => {
      const target = await tx.membership.findUnique({
        where: { userId_organizationId: { userId: targetUserId, organizationId } },
        select: { userId: true, organizationId: true, accepted: true, role: true },
      });
      if (!target) throw new ResourceNotFoundError("Membership", targetUserId);

      const ownerCount =
        target.role === "owner" ? await tx.membership.count({ where: { organizationId, role: "owner" } }) : 0;

      const error = validateRoleChange({
        actorRole,
        isSelf: actorUserId === targetUserId,
        targetRole: target.role,
        newRole,
        ownerCount,
        isFormbricksCloud,
      });
      if (error) throwRoleChangeError(error);

      const updated = await tx.membership.update({
        where: { userId_organizationId: { userId: targetUserId, organizationId } },
        data: { role: newRole },
        select: { userId: true, organizationId: true, accepted: true, role: true },
      });
      return { before: target, after: updated };
    });
  } catch (error) {
    return rethrow(error, "Error updating membership role");
  }
};

export const updateInviteRole = async ({
  organizationId,
  inviteId,
  actorRole,
  newRole,
  isFormbricksCloud,
}: {
  organizationId: string;
  inviteId: string;
  actorRole: TOrganizationRole;
  newRole: TOrganizationRole;
  isFormbricksCloud: boolean;
}): Promise<{ before: { role: TOrganizationRole }; after: { role: TOrganizationRole } }> => {
  try {
    const invite = await prisma.invite.findFirst({
      where: { id: inviteId, organizationId },
      select: { role: true },
    });
    if (!invite) throw new ResourceNotFoundError("Invite", inviteId);

    // A pending invite is not an owner yet, so the last-owner rule does not apply (ownerCount is moot).
    const error = validateRoleChange({
      actorRole,
      isSelf: false,
      targetRole: invite.role,
      newRole,
      ownerCount: Number.POSITIVE_INFINITY,
      isFormbricksCloud,
    });
    if (error) throwRoleChangeError(error);

    const updated = await prisma.invite.update({
      where: { id: inviteId },
      data: { role: newRole },
      select: { role: true },
    });
    return { before: invite, after: updated };
  } catch (error) {
    return rethrow(error, "Error updating invite role");
  }
};
