"use client";

import { PlusIcon } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { TTeamCapabilities } from "@/modules/fsinf-ce/teams/lib/permissions";
import { CreateTeamModal } from "@/modules/fsinf-ce/teams/team-list/components/create-team-modal";
import { ManageTeamModal } from "@/modules/fsinf-ce/teams/team-list/components/manage-team-modal";
import type { TTeamDetails, TTeamMember } from "@/modules/fsinf-ce/teams/team-list/types/team";
import type { TOrganizationWorkspace } from "@/modules/fsinf-ce/teams/team-list/types/workspace";
import { Badge } from "@/modules/ui/components/badge";
import { Button } from "@/modules/ui/components/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/modules/ui/components/table";

interface TeamsTableProps {
  organizationId: string;
  currentUserId: string;
  canCreateTeams: boolean;
  teams: { team: TTeamDetails; capabilities: TTeamCapabilities }[];
  eligibleMembers: Omit<TTeamMember, "role">[];
  workspaces: TOrganizationWorkspace[];
}

/** FSINF CE: client part of the Teams card — list, create, and open a team for managing. */
export const TeamsTable = ({
  organizationId,
  currentUserId,
  canCreateTeams,
  teams,
  eligibleMembers,
  workspaces,
}: Readonly<TeamsTableProps>) => {
  const { t } = useTranslation();
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [openTeamId, setOpenTeamId] = useState<string | null>(null);

  // Looked up on every render so the dialog shows fresh data after router.refresh().
  const openTeam = teams.find(({ team }) => team.id === openTeamId);

  return (
    <div className="space-y-4 pb-4">
      {canCreateTeams && (
        <div className="flex justify-end">
          <Button size="sm" onClick={() => setIsCreateOpen(true)}>
            <PlusIcon />
            {t("workspace.settings.teams.create_new_team")}
          </Button>
        </div>
      )}

      {teams.length === 0 ? (
        <p className="py-4 text-center text-sm text-slate-500">
          {canCreateTeams
            ? t("workspace.settings.teams.empty_teams_state")
            : t("workspace.settings.teams.no_teams_you_belong_to")}
        </p>
      ) : (
        <div className="overflow-hidden rounded-lg border border-slate-200">
          <Table>
            <TableHeader>
              <TableRow className="bg-slate-100">
                <TableHead>{t("common.team_name")}</TableHead>
                <TableHead>{t("common.members")}</TableHead>
                <TableHead>{t("common.workspaces")}</TableHead>
                <TableHead className="text-right">{t("common.actions")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {teams.map(({ team, capabilities }) => {
                const isMember = team.members.some((member) => member.userId === currentUserId);
                const canEdit = capabilities.canManageMembers || capabilities.canManageTeam;
                return (
                  <TableRow key={team.id}>
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        <span className="truncate">{team.name}</span>
                        {isMember && (
                          <Badge
                            type="gray"
                            size="tiny"
                            text={t("workspace.settings.teams.you_are_a_member")}
                          />
                        )}
                      </div>
                    </TableCell>
                    <TableCell>{t("common.count_members", { count: team.members.length })}</TableCell>
                    <TableCell>
                      {t("workspace.settings.teams.workspace_count", { count: team.workspaces.length })}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button size="sm" variant="secondary" onClick={() => setOpenTeamId(team.id)}>
                        {canEdit ? t("workspace.settings.teams.manage_team") : t("common.view")}
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      <p className="text-xs text-slate-500">{t("workspace.settings.teams.authentik_sync_hint")}</p>

      {canCreateTeams && (
        <CreateTeamModal open={isCreateOpen} setOpen={setIsCreateOpen} organizationId={organizationId} />
      )}

      {openTeam && (
        <ManageTeamModal
          open
          setOpen={(open) => {
            if (!open) setOpenTeamId(null);
          }}
          team={openTeam.team}
          capabilities={openTeam.capabilities}
          currentUserId={currentUserId}
          eligibleMembers={eligibleMembers}
          workspaces={workspaces}
        />
      )}
    </div>
  );
};
