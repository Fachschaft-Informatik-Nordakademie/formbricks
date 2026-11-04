import "server-only";
import { getIsWorkflowsEnabled } from "@/modules/fsinf-ce/features";
import { getWorkspaceAuth } from "@/modules/workspaces/lib/utils";

/**
 * FSINF CE: route-level authorization for the workflows pages. Reuses `getWorkspaceAuth` (session,
 * workspace access, billing redirect, team permission) and adds the organization's workflows
 * entitlement. The v3 API enforces the same rules again on every request; this only decides what the
 * pages render (read-only mode, upgrade prompt).
 */
export interface TWorkflowsRouteAuth {
  isReadOnly: boolean;
  isWorkflowsEnabled: boolean;
  organizationId: string;
}

export const getWorkflowsRouteAuth = async (workspaceId: string): Promise<TWorkflowsRouteAuth> => {
  const { isReadOnly, organization } = await getWorkspaceAuth(workspaceId);
  const isWorkflowsEnabled = await getIsWorkflowsEnabled(organization.id);

  return { isReadOnly, isWorkflowsEnabled, organizationId: organization.id };
};
