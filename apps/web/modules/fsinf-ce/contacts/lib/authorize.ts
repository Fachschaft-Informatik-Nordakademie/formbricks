/**
 * FSINF CE: shared authorization for contacts/segments server actions: organization owner/manager,
 * or a team permission on the workspace of at least `minPermission`. Also enforces the feature flag.
 */
import "server-only";
import { OperationNotAllowedError } from "@formbricks/types/errors";
import { checkAuthorizationUpdated } from "@/lib/utils/action-client/action-client-middleware";
import { getOrganizationIdFromWorkspaceId } from "@/lib/utils/helper";
import { getIsContactsEnabled } from "@/modules/fsinf-ce/features";

export const authorizeContactsAccess = async (
  userId: string,
  workspaceId: string,
  minPermission: "read" | "readWrite" | "manage"
): Promise<string> => {
  const organizationId = await getOrganizationIdFromWorkspaceId(workspaceId);
  if (!(await getIsContactsEnabled(organizationId))) {
    throw new OperationNotAllowedError("Contacts are not enabled for this organization");
  }
  await checkAuthorizationUpdated({
    userId,
    organizationId,
    access: [
      { type: "organization", roles: ["owner", "manager"] },
      { type: "workspaceTeam", workspaceId, minPermission },
    ],
  });
  return organizationId;
};
