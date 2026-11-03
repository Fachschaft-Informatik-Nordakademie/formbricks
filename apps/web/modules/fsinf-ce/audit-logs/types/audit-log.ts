/**
 * FSINF CE audit log vocabulary.
 *
 * The known values are listed for autocompletion and review; the unions stay open (`string & {}`) so a
 * call site introducing a new action or target does not need a change here to compile. The record
 * is a log line, not a schema-bound row, so an unknown value cannot corrupt anything.
 */

export const UNKNOWN_DATA = "unknown";

export type TAuditAction =
  | "created"
  | "updated"
  | "deleted"
  | "createdUpdated"
  | "merged"
  | "archived"
  | "restored"
  | "published"
  | "copiedToOtherWorkspace"
  | "addedToResponse"
  | "removedFromResponse"
  | "signedIn"
  | "userSignedOut"
  | "authenticationAttempted"
  | "authenticationSucceeded"
  | "emailVerificationAttempted"
  | "emailVerified"
  | "verificationEmailSent"
  | "passwordReset"
  | "twoFactorAttempted"
  | "twoFactorVerified"
  | (string & {});

export type TAuditTarget =
  | "actionClass"
  | "apiKey"
  | "contact"
  | "contactAttributeKey"
  | "file"
  | "integration"
  | "invite"
  | "language"
  | "membership"
  | "organization"
  | "quota"
  | "response"
  | "segment"
  | "survey"
  | "tag"
  | "team"
  | "user"
  | "webhook"
  | "workflow"
  | "workspace"
  | "workspaceTeam"
  | (string & {});

export type TAuditStatus = "success" | "failure";

export type TAuditUserType = "user" | "api" | "system";

export type TAuditEventInput = {
  action: TAuditAction;
  targetType: TAuditTarget;
  targetId: string;
  userId: string;
  userType: TAuditUserType;
  organizationId: string;
  status: TAuditStatus;
  oldObject?: Record<string, unknown> | null;
  newObject?: Record<string, unknown> | null;
  eventId?: string;
  apiUrl?: string;
  ipAddress?: string;
};
