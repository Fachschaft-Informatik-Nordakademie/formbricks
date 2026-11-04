import { SettingsCard } from "@/app/(app)/workspaces/[workspaceId]/settings/components/SettingsCard";
import { getTranslate } from "@/lingodotdev/server";
import { getAccessControlPermission } from "@/modules/fsinf-ce/features";
import { getTeamsByOrganizationId } from "@/modules/fsinf-ce/teams/team-list/lib/team";
import { WorkspaceTeamsTable } from "@/modules/fsinf-ce/teams/workspace-teams/components/workspace-teams-table";
import { getTeamsByWorkspaceId } from "@/modules/fsinf-ce/teams/workspace-teams/lib/workspace-teams";
import { PageContentWrapper } from "@/modules/ui/components/page-content-wrapper";
import { PageHeader } from "@/modules/ui/components/page-header";
import { getWorkspaceAuth } from "@/modules/workspaces/lib/utils";

/**
 * FSINF CE: workspace settings → Team Access. Shows which teams reach this workspace and with which
 * permission; organization owners and managers can add, change and remove team access here.
 * `getWorkspaceAuth` rejects anyone without access to the workspace.
 */
export const WorkspaceTeams = async (props: Readonly<{ params: Promise<{ workspaceId: string }> }>) => {
  const params = await props.params;
  const t = await getTranslate();

  const { workspace, organization, isOwner, isManager } = await getWorkspaceAuth(params.workspaceId);
  const isAccessControlAllowed = await getAccessControlPermission(organization.id);
  const canEdit = isAccessControlAllowed && (isOwner || isManager);

  const [workspaceTeams, organizationTeams] = await Promise.all([
    getTeamsByWorkspaceId(workspace.id),
    canEdit ? getTeamsByOrganizationId(organization.id) : Promise.resolve([]),
  ]);

  return (
    <PageContentWrapper>
      <PageHeader pageTitle={t("common.team_access")} />
      <SettingsCard
        title={t("common.team_access")}
        description={t("workspace.teams.team_settings_description")}>
        <WorkspaceTeamsTable
          workspaceId={workspace.id}
          organizationId={organization.id}
          workspaceTeams={workspaceTeams}
          organizationTeams={organizationTeams}
          canEdit={canEdit}
        />
      </SettingsCard>
    </PageContentWrapper>
  );
};
