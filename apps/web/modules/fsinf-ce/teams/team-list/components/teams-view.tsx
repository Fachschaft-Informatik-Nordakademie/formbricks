import { TOrganizationRole } from "@formbricks/types/memberships";
import { SettingsCard } from "@/app/(app)/workspaces/[workspaceId]/settings/components/SettingsCard";
import { getTranslate } from "@/lingodotdev/server";
import { getTeamCapabilities, isOrganizationOwnerOrManager } from "@/modules/fsinf-ce/teams/lib/permissions";
import { TeamsTable } from "@/modules/fsinf-ce/teams/team-list/components/teams-table";
import {
  getOrganizationWorkspaces,
  getTeamDetailsByOrganizationId,
  getTeamEligibleMembers,
} from "@/modules/fsinf-ce/teams/team-list/lib/team";

interface TeamsViewProps {
  organizationId: string;
  membershipRole?: TOrganizationRole;
  currentUserId: string;
  isAccessControlAllowed: boolean;
}

/**
 * FSINF CE: the "Teams" card in organization settings → Teams.
 *
 * Owners and managers see and manage every team. Everyone else sees only the teams they belong to;
 * team admins can manage those teams' members (see `teams/lib/permissions.ts`).
 */
export const TeamsView = async ({
  organizationId,
  membershipRole,
  currentUserId,
  isAccessControlAllowed,
}: Readonly<TeamsViewProps>) => {
  if (!isAccessControlAllowed || !membershipRole || membershipRole === "billing") return null;

  const t = await getTranslate();
  const isOwnerOrManager = isOrganizationOwnerOrManager(membershipRole);

  const teams = await getTeamDetailsByOrganizationId(
    organizationId,
    isOwnerOrManager ? undefined : currentUserId
  );

  const teamsWithCapabilities = teams.map((team) => ({
    team,
    capabilities: getTeamCapabilities({
      organizationRole: membershipRole,
      teamRole: team.members.find((member) => member.userId === currentUserId)?.role ?? null,
    }),
  }));

  const canManageAnyMembers = teamsWithCapabilities.some(({ capabilities }) => capabilities.canManageMembers);

  const [eligibleMembers, workspaces] = await Promise.all([
    canManageAnyMembers ? getTeamEligibleMembers(organizationId) : Promise.resolve([]),
    isOwnerOrManager ? getOrganizationWorkspaces(organizationId) : Promise.resolve([]),
  ]);

  return (
    <SettingsCard
      title={t("workspace.settings.teams.teams")}
      description={t("workspace.settings.teams.teams_description")}>
      <TeamsTable
        organizationId={organizationId}
        currentUserId={currentUserId}
        canCreateTeams={isOwnerOrManager}
        teams={teamsWithCapabilities}
        eligibleMembers={eligibleMembers}
        workspaces={workspaces}
      />
    </SettingsCard>
  );
};
