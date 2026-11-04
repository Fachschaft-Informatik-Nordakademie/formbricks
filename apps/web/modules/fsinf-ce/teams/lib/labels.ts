import type { TTeamRole } from "@/modules/fsinf-ce/teams/team-list/types/team";
import type { TTeamPermission } from "@/modules/fsinf-ce/teams/workspace-teams/types/team";

/** FSINF CE: i18n keys for team roles and workspace permissions, shared by the team UIs. */

export const TEAM_PERMISSION_OPTIONS: readonly TTeamPermission[] = ["read", "readWrite", "manage"];

export const TEAM_ROLE_OPTIONS: readonly TTeamRole[] = ["admin", "contributor"];

export const TEAM_PERMISSION_LABEL_KEYS: Record<TTeamPermission, string> = {
  read: "workspace.settings.teams.read",
  readWrite: "workspace.settings.teams.read_write",
  manage: "workspace.settings.teams.manage",
};

export const TEAM_ROLE_LABEL_KEYS: Record<TTeamRole, string> = {
  admin: "workspace.settings.teams.team_admin",
  contributor: "workspace.settings.teams.contributor",
};
