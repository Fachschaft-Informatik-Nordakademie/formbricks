import { ResourceNotFoundError } from "@formbricks/types/errors";
import { MainNavigation } from "@/app/(app)/workspaces/[workspaceId]/components/MainNavigation";
import { TopControlBar } from "@/app/(app)/workspaces/[workspaceId]/components/TopControlBar";
import { IS_DEVELOPMENT, IS_FORMBRICKS_CLOUD, IS_FORMBRICKS_SURVEYS_CONFIGURED } from "@/lib/constants";
import { getPublicDomain } from "@/lib/getPublicUrl";
import { getAccessFlags } from "@/lib/membership/utils";
import { getTranslate } from "@/lingodotdev/server";
import { getOrganizationWorkspacesLimit } from "@/modules/fsinf-ce/features";
import { TWorkspaceLayoutData } from "@/modules/workspaces/types/workspace-auth";

interface WorkspaceLayoutProps {
  layoutData: TWorkspaceLayoutData;
  children?: React.ReactNode;
}

/**
 * FSINF CE: self-hosted layout. The cloud trial/plan banners and the EE license downgrade banner are
 * gone with `modules/ee`; there is no plan or license whose state could be shown here.
 */
export const WorkspaceLayout = async ({ layoutData, children }: WorkspaceLayoutProps) => {
  const t = await getTranslate();
  const publicDomain = getPublicDomain();

  const {
    user,
    organization,
    membership,
    workspace,
    isAccessControlAllowed,
    workspacePermission,
    isMultiOrgEnabled,
    responseCount,
  } = layoutData;

  const { isMember, isOwner, isManager } = getAccessFlags(membership.role);
  const isOwnerOrManager = isOwner || isManager;
  const organizationWorkspacesLimit = await getOrganizationWorkspacesLimit(organization.id);

  // Validate that workspace permission exists for members
  if (isMember && !workspacePermission) {
    throw new ResourceNotFoundError(t("common.workspace"), null);
  }

  return (
    <div className="flex h-screen min-h-screen flex-col overflow-hidden">
      <div className="flex h-full">
        <MainNavigation
          organization={organization}
          user={user}
          workspace={{ id: workspace.id, name: workspace.name }}
          isFormbricksCloud={IS_FORMBRICKS_CLOUD}
          isDevelopment={IS_DEVELOPMENT}
          membershipRole={membership.role}
          publicDomain={publicDomain}
          organizationWorkspacesLimit={organizationWorkspacesLimit}
          isLicenseActive={true}
          isAccessControlAllowed={isAccessControlAllowed}
          responseCount={responseCount}
          newTrialBannerVariant={false}
          isFormbricksSurveysConfigured={IS_FORMBRICKS_SURVEYS_CONFIGURED}
        />
        <div id="mainContent" className="flex flex-1 flex-col overflow-hidden bg-slate-50">
          <TopControlBar
            currentOrganizationId={organization.id}
            isMultiOrgEnabled={isMultiOrgEnabled}
            organizationWorkspacesLimit={organizationWorkspacesLimit}
            isFormbricksCloud={IS_FORMBRICKS_CLOUD}
            isLicenseActive={true}
            isOwnerOrManager={isOwnerOrManager}
            isAccessControlAllowed={isAccessControlAllowed}
            membershipRole={membership.role}
          />
          <div className="flex-1 overflow-y-auto">{children}</div>
        </div>
      </div>
    </div>
  );
};
