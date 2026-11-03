import type { TTeamPermission } from "@/modules/fsinf-ce/teams/workspace-teams/types/team";

/**
 * FSINF CE: turns a resolved workspace permission into exact-match flags.
 *
 * The flags are deliberately NOT cumulative: call sites derive "read-only" from `hasReadAccess`
 * (e.g. `isMember && hasReadAccess`), so a `readWrite` grant must not also set `hasReadAccess`.
 * A missing permission (null/undefined) sets no flag at all — the most restricted outcome.
 */
export const getTeamPermissionFlags = (permission?: TTeamPermission | null) => ({
  hasReadAccess: permission === "read",
  hasReadWriteAccess: permission === "readWrite",
  hasManageAccess: permission === "manage",
});
