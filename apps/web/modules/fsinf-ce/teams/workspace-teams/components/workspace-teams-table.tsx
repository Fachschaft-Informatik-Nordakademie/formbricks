"use client";

import { TrashIcon } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  removeTeamWorkspaceAction,
  setTeamWorkspacePermissionAction,
} from "@/modules/fsinf-ce/teams/actions";
import { TEAM_PERMISSION_LABEL_KEYS, TEAM_PERMISSION_OPTIONS } from "@/modules/fsinf-ce/teams/lib/labels";
import { useTeamAction } from "@/modules/fsinf-ce/teams/lib/use-team-action";
import type { TOrganizationTeam } from "@/modules/fsinf-ce/teams/team-list/types/team";
import type { TTeamPermission, TWorkspaceTeam } from "@/modules/fsinf-ce/teams/workspace-teams/types/team";
import { organizationSettingsPath } from "@/modules/settings/lib/routes";
import { Button } from "@/modules/ui/components/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/modules/ui/components/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/modules/ui/components/table";

interface WorkspaceTeamsTableProps {
  workspaceId: string;
  organizationId: string;
  workspaceTeams: TWorkspaceTeam[];
  organizationTeams: TOrganizationTeam[];
  canEdit: boolean;
}

/** FSINF CE: client part of workspace settings → Team Access. */
export const WorkspaceTeamsTable = ({
  workspaceId,
  organizationId,
  workspaceTeams,
  organizationTeams,
  canEdit,
}: Readonly<WorkspaceTeamsTableProps>) => {
  const { t } = useTranslation();
  const { run, isPending } = useTeamAction();
  const [newTeamId, setNewTeamId] = useState("");
  const [newPermission, setNewPermission] = useState<TTeamPermission>("read");

  const teamIdsWithAccess = new Set(workspaceTeams.map((team) => team.id));
  const addableTeams = organizationTeams.filter((team) => !teamIdsWithAccess.has(team.id));

  const setPermission = (teamId: string, permission: TTeamPermission) =>
    run(
      () => setTeamWorkspacePermissionAction({ teamId, workspaceId, permission }),
      t("workspace.teams.team_access_updated")
    );

  const handleAdd = async () => {
    if (!newTeamId) return;
    const ok = await setPermission(newTeamId, newPermission);
    if (ok) {
      setNewTeamId("");
      setNewPermission("read");
    }
  };

  const renderPermissionSelect = (
    value: TTeamPermission,
    onChange: (permission: TTeamPermission) => void,
    disabled: boolean
  ) => (
    <Select
      value={value}
      disabled={disabled}
      onValueChange={(permission) => onChange(permission as TTeamPermission)}>
      <SelectTrigger aria-label={t("workspace.teams.permission")}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {TEAM_PERMISSION_OPTIONS.map((permission) => (
          <SelectItem key={permission} value={permission}>
            {t(TEAM_PERMISSION_LABEL_KEYS[permission])}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );

  return (
    <div className="space-y-4 pb-4">
      {workspaceTeams.length === 0 ? (
        <p className="py-4 text-center text-sm text-slate-500">{t("workspace.teams.no_teams_found")}</p>
      ) : (
        <div className="overflow-hidden rounded-lg border border-slate-200">
          <Table>
            <TableHeader>
              <TableRow className="bg-slate-100">
                <TableHead>{t("workspace.teams.team_name")}</TableHead>
                <TableHead>{t("common.members")}</TableHead>
                <TableHead className="w-48">{t("workspace.teams.permission")}</TableHead>
                {canEdit && <TableHead className="w-12" />}
              </TableRow>
            </TableHeader>
            <TableBody>
              {workspaceTeams.map((team) => (
                <TableRow key={team.id}>
                  <TableCell className="font-medium">{team.name}</TableCell>
                  <TableCell>{t("common.count_members", { count: team.memberCount })}</TableCell>
                  <TableCell>
                    {canEdit ? (
                      renderPermissionSelect(
                        team.permission,
                        (permission) => setPermission(team.id, permission),
                        isPending
                      )
                    ) : (
                      <span>{t(TEAM_PERMISSION_LABEL_KEYS[team.permission])}</span>
                    )}
                  </TableCell>
                  {canEdit && (
                    <TableCell>
                      <Button
                        size="icon"
                        variant="ghost"
                        aria-label={t("common.remove")}
                        disabled={isPending}
                        onClick={() =>
                          run(
                            () => removeTeamWorkspaceAction({ teamId: team.id, workspaceId }),
                            t("workspace.teams.team_access_removed")
                          )
                        }>
                        <TrashIcon />
                      </Button>
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {canEdit &&
        (addableTeams.length === 0 ? (
          organizationTeams.length > 0 && (
            <p className="text-xs text-slate-500">{t("workspace.teams.all_teams_have_access")}</p>
          )
        ) : (
          <div className="flex gap-2">
            <div className="min-w-0 flex-1">
              <Select value={newTeamId} onValueChange={setNewTeamId}>
                <SelectTrigger aria-label={t("workspace.teams.select_team")}>
                  <SelectValue placeholder={t("workspace.teams.select_team")} />
                </SelectTrigger>
                <SelectContent>
                  {addableTeams.map((team) => (
                    <SelectItem key={team.id} value={team.id}>
                      {team.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="w-48">{renderPermissionSelect(newPermission, setNewPermission, false)}</div>
            <Button variant="secondary" onClick={handleAdd} disabled={!newTeamId || isPending}>
              {t("workspace.teams.add_team")}
            </Button>
          </div>
        ))}

      <div className="flex flex-col gap-1 text-xs text-slate-500 sm:flex-row sm:items-center sm:justify-between">
        <p>
          {canEdit
            ? t("workspace.teams.owners_managers_full_access")
            : t("workspace.teams.owner_manager_only_edit")}
        </p>
        {canEdit && (
          <Link
            href={organizationSettingsPath(organizationId, "teams")}
            className="font-medium text-slate-700 underline-offset-4 hover:underline">
            {t("workspace.teams.manage_teams")}
          </Link>
        )}
      </div>
    </div>
  );
};
