import type { TSurveyFsinfSso } from "@formbricks/types/surveys/types";

/**
 * FSINF: who is answering an SSO-protected link survey, as attested by Authentik's ID token.
 *
 * `sub` is Authentik's per-provider hashed user id (sub_mode "hashed_user_id"), so it identifies the
 * account without being its username. It is what the one-response-per-account pseudonym is derived
 * from; the other fields are only used for the allowlist check and — if the survey asks for it — for
 * recording who answered.
 */
export interface TRespondentIdentity {
  sub: string;
  username: string;
  email: string;
  name: string;
  groups: string[];
}

const normalize = (value: string): string => value.trim().toLowerCase();

const normalizedList = (values: readonly string[] | undefined): string[] =>
  (values ?? []).map(normalize).filter(Boolean);

/**
 * The allowlist decision. Groups and users combine as OR: being in one allowed group OR being listed
 * by username/email is enough. With neither configured, every Authentik account may answer — the SSO
 * requirement alone then only guarantees "a real NAK-Studis account, at most once".
 *
 * Blank entries are ignored rather than trusted: a stray empty line in the editor must neither open
 * the survey to everyone nor lock everyone out.
 */
export const isRespondentAllowed = (
  config: Pick<NonNullable<TSurveyFsinfSso>, "allowedGroups" | "allowedUsers">,
  identity: TRespondentIdentity
): boolean => {
  const allowedGroups = normalizedList(config.allowedGroups);
  const allowedUsers = normalizedList(config.allowedUsers);

  if (allowedGroups.length === 0 && allowedUsers.length === 0) {
    return true;
  }

  const memberOf = new Set(normalizedList(identity.groups));
  if (allowedGroups.some((group) => memberOf.has(group))) {
    return true;
  }

  const handles = [identity.username, identity.email].map(normalize).filter(Boolean);
  return handles.some((handle) => allowedUsers.includes(handle));
};

/** True when the survey is gated behind the respondent SSO login. */
export const isFsinfSsoRequired = (survey: { fsinfSso?: TSurveyFsinfSso | null }): boolean =>
  Boolean(survey.fsinfSso?.enabled);

/**
 * Response-data keys the gate writes from the verified session when `recordIdentity` is on. They are
 * reserved: whatever a client sends under these keys is dropped, so nobody can record a name that the
 * session did not attest.
 */
export const FSINF_SSO_RESPONSE_KEYS = {
  name: "fsinfSsoName",
  username: "fsinfSsoUsername",
  email: "fsinfSsoEmail",
} as const;

export const FSINF_SSO_RESPONSE_KEY_LIST: readonly string[] = Object.values(FSINF_SSO_RESPONSE_KEYS);

const dataString = (data: Record<string, unknown>, key: string): string =>
  typeof data[key] === "string" ? (data[key] as string) : "";

/** The recorded identity of a response, or null when none was recorded (pseudonymous survey). */
export const getRecordedFsinfSsoIdentity = (
  data: Record<string, unknown>
): { name: string; username: string; email: string } | null => {
  const identity = {
    name: dataString(data, FSINF_SSO_RESPONSE_KEYS.name),
    username: dataString(data, FSINF_SSO_RESPONSE_KEYS.username),
    email: dataString(data, FSINF_SSO_RESPONSE_KEYS.email),
  };
  return identity.name || identity.username || identity.email ? identity : null;
};

/** "Max Muster (max.muster) · max@nak-studis.de" — for table cells and cards. */
export const formatRecordedFsinfSsoIdentity = (data: Record<string, unknown>): string => {
  const identity = getRecordedFsinfSsoIdentity(data);
  if (!identity) return "";
  const who =
    identity.name && identity.username
      ? `${identity.name} (${identity.username})`
      : identity.name || identity.username;
  return [who, identity.email].filter(Boolean).join(" · ");
};

/** Export columns for a recorded identity (CSV/XLSX), in this order. */
export const FSINF_SSO_EXPORT_COLUMNS = [
  { header: "SSO Name", key: FSINF_SSO_RESPONSE_KEYS.name },
  { header: "SSO Username", key: FSINF_SSO_RESPONSE_KEYS.username },
  { header: "SSO Email", key: FSINF_SSO_RESPONSE_KEYS.email },
] as const;

export const FSINF_SSO_EXPORT_HEADERS: string[] = FSINF_SSO_EXPORT_COLUMNS.map((column) => column.header);
