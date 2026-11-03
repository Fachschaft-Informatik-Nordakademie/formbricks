import type { TOrganizationRole } from "@formbricks/types/memberships";

/**
 * FSINF CE: who may give which organization role to whom. Pure, so the server action and the role
 * dropdown apply exactly the same rules.
 *
 *   • Owners may assign every role (billing only on Formbricks Cloud, as for invites).
 *   • Managers may only assign `member` — the same limit `inviteUserAction` puts on their invites —
 *     and never touch an owner.
 *   • Nobody changes their own role (no self-promotion, no accidental self-lockout).
 *   • The last owner cannot be demoted.
 */

export type TRoleChangeError =
  | "not_authorized"
  | "cannot_change_own_role"
  | "cannot_change_owner"
  | "role_not_assignable"
  | "last_owner";

export const getAssignableOrganizationRoles = (
  actorRole: TOrganizationRole | undefined,
  isFormbricksCloud: boolean
): TOrganizationRole[] => {
  if (actorRole === "owner") {
    return isFormbricksCloud ? ["owner", "manager", "member", "billing"] : ["owner", "manager", "member"];
  }
  if (actorRole === "manager") return ["member"];
  return [];
};

export const validateRoleChange = ({
  actorRole,
  isSelf,
  targetRole,
  newRole,
  ownerCount,
  isFormbricksCloud,
}: {
  actorRole: TOrganizationRole | undefined;
  /** The actor is changing their own membership. Always false for invites. */
  isSelf: boolean;
  targetRole: TOrganizationRole;
  newRole: TOrganizationRole;
  /** Accepted owners in the organization; only consulted when an owner is demoted. */
  ownerCount: number;
  isFormbricksCloud: boolean;
}): TRoleChangeError | null => {
  if (actorRole !== "owner" && actorRole !== "manager") return "not_authorized";
  if (isSelf) return "cannot_change_own_role";
  if (actorRole === "manager" && targetRole === "owner") return "cannot_change_owner";
  if (!getAssignableOrganizationRoles(actorRole, isFormbricksCloud).includes(newRole)) {
    return "role_not_assignable";
  }
  if (targetRole === "owner" && newRole !== "owner" && ownerCount <= 1) return "last_owner";
  return null;
};

/** Whether the role dropdown for a target should be interactive at all. */
export const canEditRoleOf = ({
  actorRole,
  isSelf,
  targetRole,
  ownerCount,
  isFormbricksCloud,
}: {
  actorRole: TOrganizationRole | undefined;
  isSelf: boolean;
  targetRole: TOrganizationRole;
  ownerCount: number;
  isFormbricksCloud: boolean;
}): boolean =>
  getAssignableOrganizationRoles(actorRole, isFormbricksCloud).some(
    (newRole) =>
      newRole !== targetRole &&
      validateRoleChange({ actorRole, isSelf, targetRole, newRole, ownerCount, isFormbricksCloud }) === null
  );
