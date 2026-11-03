// Single source of truth for settings URLs after the route-scoping refactor:
// - organization settings live at /organizations/[organizationId]/settings/*
// - account settings live at /account/settings/*
// - workspace settings stay at /workspaces/[workspaceId]/settings/workspace/*
// Keeping these in one place stops the section bases from drifting back into hardcoded strings.

export const organizationSettingsPath = (organizationId: string, slug: string): string =>
  `/organizations/${organizationId}/settings/${slug}`;

export const accountSettingsPath = (slug: string): string => `/account/settings/${slug}`;

export const workspaceSettingsPath = (workspaceId: string, slug: string): string =>
  `/workspaces/${workspaceId}/settings/workspace/${slug}`;

// Where billing-role users (and other "you can't see this settings page" cases) get sent.
// FSINF CE: there is no billing or enterprise page in this build, so it is the general org settings.
export const getOrganizationBillingPath = (organizationId: string, _isFormbricksCloud: boolean): string =>
  organizationSettingsPath(organizationId, "general");
