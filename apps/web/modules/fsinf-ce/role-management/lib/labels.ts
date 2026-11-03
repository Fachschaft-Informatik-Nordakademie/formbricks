import type { TOrganizationRole } from "@formbricks/types/memberships";

/** FSINF CE: i18n keys for organization roles. */

export const ORGANIZATION_ROLE_LABEL_KEYS: Record<TOrganizationRole, string> = {
  owner: "workspace.settings.teams.owner",
  manager: "workspace.settings.teams.manager",
  member: "workspace.settings.teams.member",
  billing: "common.billing",
};

export const ORGANIZATION_ROLE_DESCRIPTION_KEYS: Record<TOrganizationRole, string> = {
  owner: "workspace.settings.teams.owner_role_description",
  manager: "workspace.settings.teams.manager_role_description",
  member: "workspace.settings.teams.member_role_description",
  billing: "workspace.settings.teams.billing_role_description",
};
