import "server-only";

/**
 * FSINF Community Edition — feature availability for this AGPL-only build.
 *
 * This fork ships without `apps/web/modules/ee` (Formbricks Enterprise Edition, separately licensed).
 * Everything that used to be decided by the EE license check is decided here instead, by plain
 * configuration of features that are implemented in AGPL code (upstream core or our own `fsinf-ce`
 * modules). There is no license, no license server and no workspace limit.
 *
 * Features whose implementation lived only in `ee/` and that we did not rebuild are reported as
 * unavailable, so the AGPL UI keeps hiding their entry points.
 *
 * The functions keep the async, organization-scoped signatures of the call sites they serve, so the
 * call sites did not have to change shape.
 */

export type TFsinfFeature =
  | "accessControl"
  | "contacts"
  | "quotas"
  | "workflows"
  | "spamProtection"
  | "biggerUploadFileSize"
  | "bulkInvite"
  | "removeBranding"
  | "whitelabel"
  | "multiOrg"
  | "sso"
  | "samlSso"
  | "twoFactorAuth"
  | "aiSmartTools"
  | "feedbackDirectories";

/** Single source of truth: what this build can actually do. */
export const FSINF_FEATURES: Readonly<Record<TFsinfFeature, boolean>> = {
  // Rebuilt in fsinf-ce
  accessControl: true,
  contacts: true,
  quotas: true,
  workflows: true,
  // Implemented in AGPL core, only gated by the license before
  spamProtection: true,
  biggerUploadFileSize: true,
  bulkInvite: true,
  // Not available in this build
  removeBranding: false,
  whitelabel: false,
  // One organization per instance; members are provisioned via Authentik SSO (fsinf-sso-provisioning).
  multiOrg: false,
  // Upstream SSO providers (Google/GitHub/Azure/OIDC/SAML) are gone; our own Authentik login is
  // configured separately in modules/auth/lib/fsinf-sso-config.ts and does not depend on this flag.
  sso: false,
  samlSso: false,
  // 2FA is handled by Authentik, the only login path.
  twoFactorAuth: false,
  aiSmartTools: false,
  feedbackDirectories: false,
};

export const isFsinfFeatureEnabled = (feature: TFsinfFeature): boolean => FSINF_FEATURES[feature];

/** No workspace limit in this build. */
export const UNLIMITED_WORKSPACES = Number.POSITIVE_INFINITY;

const flag = (feature: TFsinfFeature) => async (_organizationId?: string) => isFsinfFeatureEnabled(feature);

export const getAccessControlPermission = flag("accessControl");
export const getIsContactsEnabled = flag("contacts");
export const getIsQuotasEnabled = flag("quotas");
export const getIsWorkflowsEnabled = flag("workflows");
export const getIsSpamProtectionEnabled = flag("spamProtection");
export const getBiggerUploadFileSizePermission = flag("biggerUploadFileSize");
export const getBulkInvitePermission = flag("bulkInvite");
export const getRemoveBrandingPermission = flag("removeBranding");
export const getWhiteLabelPermission = flag("whitelabel");
export const getIsMultiOrgEnabled = flag("multiOrg");
export const getIsSsoEnabled = flag("sso");
export const getIsSamlSsoEnabled = flag("samlSso");
export const getIsTwoFactorAuthEnabled = flag("twoFactorAuth");
export const getIsAISmartToolsEnabled = flag("aiSmartTools");
export const getIsFeedbackDirectoriesEnabled = flag("feedbackDirectories");

export const getOrganizationWorkspacesLimit = async (_organizationId: string): Promise<number> =>
  UNLIMITED_WORKSPACES;
