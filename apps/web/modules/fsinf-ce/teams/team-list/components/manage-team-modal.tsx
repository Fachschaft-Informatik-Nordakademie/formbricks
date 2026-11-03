"use client";

import { TrashIcon } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  addTeamMembersAction,
  deleteTeamAction,
  removeTeamMemberAction,
  removeTeamWorkspaceAction,
  renameTeamAction,
  setTeamWorkspacePermissionAction,
  updateTeamMemberRoleAction,
} from "@/modules/fsinf-ce/teams/actions";
import {
  TEAM_PERMISSION_LABEL_KEYS,
  TEAM_PERMISSION_OPTIONS,
  TEAM_ROLE_LABEL_KEYS,
  TEAM_ROLE_OPTIONS,
} from "@/modules/fsinf-ce/teams/lib/labels";
import type { TTeamCapabilities } from "@/modules/fsinf-ce/teams/lib/permissions";
import { useTeamAction } from "@/modules/fsinf-ce/teams/lib/use-team-action";
import {
  type TTeamDetails,
  type TTeamMember,
  type TTeamRole,
  ZTeamName,
} from "@/modules/fsinf-ce/teams/team-list/types/team";
import type { TOrganizationWorkspace } from "@/modules/fsinf-ce/teams/team-list/types/workspace";
import type { TTeamPermission } from "@/modules/fsinf-ce/teams/workspace-teams/types/team";
import { Button } from "@/modules/ui/components/button";
import { DeleteDialog } from "@/modules/ui/components/delete-dialog";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/modules/ui/components/dialog";
import { Input } from "@/modules/ui/components/input";
import { Label } from "@/modules/ui/components/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/modules/ui/components/select";

interface ManageTeamModalProps {
  open: boolean;
  setOpen: (open: boolean) => void;
  team: TTeamDetails;
  capabilities: TTeamCapabilities;
  currentUserId: string;
  eligibleMembers: Omit<TTeamMember, "role">[];
  workspaces: TOrganizationWorkspace[];
}

/**
 * FSINF CE: "Manage team" dialog. Every control is shown only to people allowed to use it; the server
 * actions enforce the same rules (`teams/lib/permissions.ts`).
 */
export const ManageTeamModal = ({
  open,
  setOpen,
  team,
  capabilities,
  currentUserId,
  eligibleMembers,
  workspaces,
}: Readonly<ManageTeamModalProps>) => {
  const { t } = useTranslation();
  const { run, isPending } = useTeamAction();
  const { canManageMembers, canManageTeam } = capabilities;

  const [name, setName] = useState(team.name);
  const [newMemberId, setNewMemberId] = useState("");
  const [newMemberRole, setNewMemberRole] = useState<TTeamRole>("contributor");
  const [newWorkspaceId, setNewWorkspaceId] = useState("");
  const [newWorkspacePermission, setNewWorkspacePermission] = useState<TTeamPermission>("read");
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);

  const teamUpdated = t("workspace.settings.teams.team_updated_successfully");

  const memberIdsInTeam = new Set(team.members.map((member) => member.userId));
  const addableMembers = eligibleMembers.filter((member) => !memberIdsInTeam.has(member.userId));
  const workspaceIdsInTeam = new Set(team.workspaces.map((workspace) => workspace.workspaceId));
  const addableWorkspaces = workspaces.filter((workspace) => !workspaceIdsInTeam.has(workspace.id));

  const isNameValid = ZTeamName.safeParse(name).success;
  const isNameChanged = name.trim() !== team.name;

  const handleRename = () => run(() => renameTeamAction({ teamId: team.id, name }), teamUpdated);

  const handleAddMember = async () => {
    if (!newMemberId) return;
    const ok = await run(
      () =>
        addTeamMembersAction({ teamId: team.id, members: [{ userId: newMemberId, role: newMemberRole }] }),
      teamUpdated
    );
    if (ok) {
      setNewMemberId("");
      setNewMemberRole("contributor");
    }
  };

  const handleAddWorkspace = async () => {
    if (!newWorkspaceId) return;
    const ok = await run(
      () =>
        setTeamWorkspacePermissionAction({
          teamId: team.id,
          workspaceId: newWorkspaceId,
          permission: newWorkspacePermission,
        }),
      teamUpdated
    );
    if (ok) {
      setNewWorkspaceId("");
      setNewWorkspacePermission("read");
    }
  };

  const handleDelete = async () => {
    const ok = await run(
      () => deleteTeamAction({ teamId: team.id }),
      t("workspace.settings.teams.team_deleted_successfully")
    );
    if (ok) {
      setIsDeleteOpen(false);
      setOpen(false);
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent width="wide">
          <DialogHeader>
            <DialogTitle>
              {t("workspace.settings.teams.team_name_settings_title", { teamName: team.name })}
            </DialogTitle>
            <DialogDescription>{t("workspace.settings.teams.team_settings_description")}</DialogDescription>
          </DialogHeader>

          <DialogBody className="space-y-6">
            {canManageTeam && (
              <section className="space-y-2">
                <Label htmlFor="fsinf-rename-team">{t("workspace.settings.teams.team_name")}</Label>
                <div className="flex gap-2">
                  <Input
                    id="fsinf-rename-team"
                    value={name}
                    maxLength={100}
                    onChange={(event) => setName(event.target.value)}
                  />
                  <Button
                    variant="secondary"
                    onClick={handleRename}
                    disabled={!isNameValid || !isNameChanged || isPending}>
                    {t("common.save")}
                  </Button>
                </div>
              </section>
            )}

            <section className="space-y-2">
              <div>
                <h3 className="text-sm font-medium text-slate-900">{t("common.members")}</h3>
                {canManageMembers && (
                  <p className="text-xs text-slate-500">
                    {t("workspace.settings.teams.add_members_description")}
                  </p>
                )}
              </div>
              {team.members.length === 0 ? (
                <p className="text-sm text-slate-500">{t("workspace.settings.teams.no_team_members")}</p>
              ) : (
                <ul className="divide-y divide-slate-100 rounded-md border border-slate-200">
                  {team.members.map((member) => (
                    <li key={member.userId} className="flex items-center gap-3 px-3 py-2">
                      <div className="ph-no-capture min-w-0 flex-1">
                        <p className="truncate text-sm text-slate-900">
                          {member.name}{" "}
                          {member.userId === currentUserId && (
                            <span className="text-slate-500">{t("workspace.settings.teams.you_suffix")}</span>
                          )}
                        </p>
                        <p className="truncate text-xs text-slate-500">{member.email}</p>
                      </div>
                      <div className="w-40">
                        <Select
                          value={member.role}
                          disabled={!canManageMembers || isPending}
                          onValueChange={(role) =>
                            run(
                              () =>
                                updateTeamMemberRoleAction({
                                  teamId: team.id,
                                  userId: member.userId,
                                  role: role as TTeamRole,
                                }),
                              teamUpdated
                            )
                          }>
                          <SelectTrigger aria-label={t("common.team_role")}>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {TEAM_ROLE_OPTIONS.map((role) => (
                              <SelectItem key={role} value={role}>
                                {t(TEAM_ROLE_LABEL_KEYS[role])}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      {canManageMembers && (
                        <Button
                          size="icon"
                          variant="ghost"
                          aria-label={t("common.remove_from_team")}
                          disabled={isPending}
                          onClick={() =>
                            run(
                              () => removeTeamMemberAction({ teamId: team.id, userId: member.userId }),
                              teamUpdated
                            )
                          }>
                          <TrashIcon />
                        </Button>
                      )}
                    </li>
                  ))}
                </ul>
              )}
              {canManageMembers &&
                (addableMembers.length === 0 ? (
                  <p className="text-xs text-slate-500">{t("workspace.settings.teams.all_members_added")}</p>
                ) : (
                  <div className="flex gap-2">
                    <div className="min-w-0 flex-1">
                      <Select value={newMemberId} onValueChange={setNewMemberId}>
                        <SelectTrigger aria-label={t("workspace.settings.teams.select_member")}>
                          <SelectValue placeholder={t("workspace.settings.teams.select_member")} />
                        </SelectTrigger>
                        <SelectContent>
                          {addableMembers.map((member) => (
                            <SelectItem key={member.userId} value={member.userId}>
                              {member.name} ({member.email})
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="w-40">
                      <Select
                        value={newMemberRole}
                        onValueChange={(role) => setNewMemberRole(role as TTeamRole)}>
                        <SelectTrigger aria-label={t("common.team_role")}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {TEAM_ROLE_OPTIONS.map((role) => (
                            <SelectItem key={role} value={role}>
                              {t(TEAM_ROLE_LABEL_KEYS[role])}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <Button
                      variant="secondary"
                      onClick={handleAddMember}
                      disabled={!newMemberId || isPending}>
                      {t("common.add_member")}
                    </Button>
                  </div>
                ))}
            </section>

            <section className="space-y-2">
              <div>
                <h3 className="text-sm font-medium text-slate-900">{t("common.workspaces")}</h3>
                <p className="text-xs text-slate-500">
                  {canManageTeam
                    ? t("workspace.settings.teams.add_workspaces_description")
                    : t("workspace.settings.teams.workspace_access_owner_manager_only")}
                </p>
              </div>
              {team.workspaces.length === 0 ? (
                <p className="text-sm text-slate-500">{t("workspace.settings.teams.no_team_workspaces")}</p>
              ) : (
                <ul className="divide-y divide-slate-100 rounded-md border border-slate-200">
                  {team.workspaces.map((workspace) => (
                    <li key={workspace.workspaceId} className="flex items-center gap-3 px-3 py-2">
                      <p className="min-w-0 flex-1 truncate text-sm text-slate-900">
                        {workspace.workspaceName}
                      </p>
                      <div className="w-40">
                        <Select
                          value={workspace.permission}
                          disabled={!canManageTeam || isPending}
                          onValueChange={(permission) =>
                            run(
                              () =>
                                setTeamWorkspacePermissionAction({
                                  teamId: team.id,
                                  workspaceId: workspace.workspaceId,
                                  permission: permission as TTeamPermission,
                                }),
                              teamUpdated
                            )
                          }>
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
                      </div>
                      {canManageTeam && (
                        <Button
                          size="icon"
                          variant="ghost"
                          aria-label={t("common.remove")}
                          disabled={isPending}
                          onClick={() =>
                            run(
                              () =>
                                removeTeamWorkspaceAction({
                                  teamId: team.id,
                                  workspaceId: workspace.workspaceId,
                                }),
                              teamUpdated
                            )
                          }>
                          <TrashIcon />
                        </Button>
                      )}
                    </li>
                  ))}
                </ul>
              )}
              {canManageTeam &&
                (addableWorkspaces.length === 0 ? (
                  <p className="text-xs text-slate-500">
                    {t("workspace.settings.teams.all_workspaces_added")}
                  </p>
                ) : (
                  <div className="flex gap-2">
                    <div className="min-w-0 flex-1">
                      <Select value={newWorkspaceId} onValueChange={setNewWorkspaceId}>
                        <SelectTrigger aria-label={t("workspace.settings.teams.select_workspace")}>
                          <SelectValue placeholder={t("workspace.settings.teams.select_workspace")} />
                        </SelectTrigger>
                        <SelectContent>
                          {addableWorkspaces.map((workspace) => (
                            <SelectItem key={workspace.id} value={workspace.id}>
                              {workspace.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="w-40">
                      <Select
                        value={newWorkspacePermission}
                        onValueChange={(permission) =>
                          setNewWorkspacePermission(permission as TTeamPermission)
                        }>
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
                    </div>
                    <Button
                      variant="secondary"
                      onClick={handleAddWorkspace}
                      disabled={!newWorkspaceId || isPending}>
                      {t("common.add_workspace")}
                    </Button>
                  </div>
                ))}
            </section>
          </DialogBody>

          <DialogFooter className="sm:justify-between">
            {canManageTeam ? (
              <Button variant="destructive" onClick={() => setIsDeleteOpen(true)} disabled={isPending}>
                {t("workspace.settings.teams.delete_team")}
              </Button>
            ) : (
              <span />
            )}
            <Button variant="secondary" onClick={() => setOpen(false)}>
              {t("common.close")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {canManageTeam && (
        <DeleteDialog
          open={isDeleteOpen}
          setOpen={setIsDeleteOpen}
          deleteWhat={t("common.team")}
          text={t("workspace.settings.teams.are_you_sure_you_want_to_delete_this_team")}
          onDelete={handleDelete}
          isDeleting={isPending}
        />
      )}
    </>
  );
};
