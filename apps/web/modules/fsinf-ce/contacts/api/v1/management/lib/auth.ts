/**
 * FSINF CE: shared helpers for the v1 management contact handlers (API-key authentication).
 */
import type { TAuthenticationApiKey } from "@formbricks/types/auth";
import type { TApiV1Authentication } from "@/app/lib/api/with-api-logging";
import { hasPermission } from "@/modules/organization/settings/api-keys/lib/utils";

export const isApiKeyAuthentication = (
  authentication: TApiV1Authentication | undefined
): authentication is TAuthenticationApiKey => !!authentication && "apiKeyId" in authentication;

/** Workspaces the API key may access with the given method. */
export const getPermittedWorkspaceIds = (
  authentication: TAuthenticationApiKey,
  method: "GET" | "POST" | "PUT" | "DELETE"
): string[] => [
  ...new Set(
    authentication.workspacePermissions
      .map((permission) => permission.workspaceId)
      .filter((workspaceId) => hasPermission(authentication.workspacePermissions, workspaceId, method))
  ),
];

export const canAccessWorkspace = (
  authentication: TAuthenticationApiKey,
  workspaceId: string,
  method: "GET" | "POST" | "PUT" | "DELETE"
): boolean => hasPermission(authentication.workspacePermissions, workspaceId, method);
