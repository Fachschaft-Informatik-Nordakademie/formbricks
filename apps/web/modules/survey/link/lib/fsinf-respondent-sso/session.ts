import "server-only";
import jwt from "jsonwebtoken";
import { createHmac } from "node:crypto";
import { logger } from "@formbricks/logger";
import { BETTER_AUTH_SECRET, NEXTAUTH_SECRET } from "@/lib/constants";
import type { TRespondentIdentity } from "./access";

/**
 * FSINF: the two signed cookies of the respondent SSO login.
 *
 * - the SESSION cookie carries the identity Authentik attested (see access.ts) for a few hours, so a
 *   respondent can open several SSO surveys without logging in again. It is httpOnly and read only on
 *   the server: by the survey page (to decide what to render) and by the public response endpoints
 *   (to enforce the same decision — the page alone would be a client-side-only control).
 * - the LOGIN-STATE cookie lives for the few minutes of one OIDC round-trip and binds the callback to
 *   the browser that started it (state, nonce, PKCE verifier, where to go back to).
 *
 * Both are HS256 JWTs with distinct `purpose` claims, so one can never be replayed as the other. The
 * key is derived from the auth secret (same resolution as pin-token.ts) instead of used verbatim, so
 * these tokens are useless against any other verifier of that secret.
 */

export const RESPONDENT_SESSION_COOKIE = "fsinf_respondent_session";
export const RESPONDENT_LOGIN_STATE_COOKIE = "fsinf_respondent_login";
export const RESPONDENT_SESSION_TTL_SECONDS = 4 * 60 * 60;
export const RESPONDENT_LOGIN_STATE_TTL_SECONDS = 10 * 60;

const SESSION_PURPOSE = "fsinf_respondent_session";
const LOGIN_STATE_PURPOSE = "fsinf_respondent_login_state";

// Resolved lazily (not at module scope) for the same reason as in pin-token.ts: tests that mock
// "@/lib/constants" must be able to import this module without the secret being defined.
const deriveKey = (label: string): string => {
  const secret = BETTER_AUTH_SECRET ?? NEXTAUTH_SECRET;
  if (!secret) {
    throw new Error("No auth secret set (BETTER_AUTH_SECRET or NEXTAUTH_SECRET)");
  }
  return createHmac("sha256", secret).update(`fsinf-respondent-sso:${label}`).digest("hex");
};

const sign = (payload: object, purpose: string, ttlSeconds: number): string =>
  jwt.sign({ ...payload, purpose }, deriveKey(purpose), { algorithm: "HS256", expiresIn: ttlSeconds });

const verify = (token: string | null | undefined, purpose: string): jwt.JwtPayload | null => {
  if (!token) return null;
  try {
    const payload = jwt.verify(token, deriveKey(purpose), { algorithms: ["HS256"] });
    if (typeof payload !== "object" || payload.purpose !== purpose) return null;
    return payload;
  } catch (error) {
    logger.warn(
      { error: error instanceof Error ? error.message : error },
      "FSINF respondent SSO: token rejected"
    );
    return null;
  }
};

const asString = (value: unknown): string => (typeof value === "string" ? value : "");

export const createRespondentSessionToken = (identity: TRespondentIdentity): string =>
  sign(
    {
      sub: identity.sub,
      username: identity.username,
      email: identity.email,
      name: identity.name,
      groups: identity.groups,
    },
    SESSION_PURPOSE,
    RESPONDENT_SESSION_TTL_SECONDS
  );

export const readRespondentSessionToken = (token: string | null | undefined): TRespondentIdentity | null => {
  const payload = verify(token, SESSION_PURPOSE);
  if (!payload || !asString(payload.sub)) return null;
  return {
    sub: asString(payload.sub),
    username: asString(payload.username),
    email: asString(payload.email),
    name: asString(payload.name),
    groups: Array.isArray(payload.groups)
      ? payload.groups.filter((g): g is string => typeof g === "string")
      : [],
  };
};

export interface TRespondentLoginState {
  state: string;
  nonce: string;
  codeVerifier: string;
  /** The survey to return to — only an id, never a URL, so the callback cannot become an open redirect. */
  surveyId: string;
  /** The survey link's query string (lang, hidden-field prefills …), already stripped of SSO params. */
  query: string;
}

export const createLoginStateToken = (loginState: TRespondentLoginState): string =>
  sign(loginState, LOGIN_STATE_PURPOSE, RESPONDENT_LOGIN_STATE_TTL_SECONDS);

export const readLoginStateToken = (token: string | null | undefined): TRespondentLoginState | null => {
  const payload = verify(token, LOGIN_STATE_PURPOSE);
  if (!payload) return null;
  const loginState = {
    state: asString(payload.state),
    nonce: asString(payload.nonce),
    codeVerifier: asString(payload.codeVerifier),
    surveyId: asString(payload.surveyId),
    query: asString(payload.query),
  };
  if (!loginState.state || !loginState.nonce || !loginState.codeVerifier || !loginState.surveyId) return null;
  return loginState;
};

/**
 * The per-survey pseudonym used as the response's `singleUseId` when a survey allows one response per
 * account. The (surveyId, singleUseId) unique index then enforces "once" in the database itself.
 *
 * Keyed HMAC over survey + account: stable, so a returning respondent resumes their own unfinished
 * response; different per survey, so pseudonyms cannot be joined across surveys; and not reversible
 * without the server secret, so a pseudonymous survey stays pseudonymous in exports.
 */
export const deriveRespondentSingleUseId = (surveyId: string, sub: string): string =>
  "sso_" +
  createHmac("sha256", deriveKey("single-use-id"))
    .update(`${surveyId}:${sub}`)
    .digest("base64url")
    .slice(0, 32);
