import "server-only";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { createHash, randomBytes } from "node:crypto";
import { logger } from "@formbricks/logger";
import { ZId } from "@formbricks/types/common";
import {
  FSINF_RESPONDENT_OIDC_CLIENT_ID,
  FSINF_RESPONDENT_OIDC_CLIENT_SECRET,
  FSINF_RESPONDENT_OIDC_ISSUER,
  WEBAPP_URL,
} from "@/lib/constants";
import type { TRespondentIdentity } from "./access";

/**
 * FSINF: minimal OIDC authorization-code flow (PKCE + state + nonce) against Authentik for respondents
 * of SSO-protected link surveys.
 *
 * Deliberately NOT Better Auth: a Better Auth sign-in creates a Formbricks user and provisions it into
 * the organization (fsinf-sso-provisioning.ts). Respondents must stay respondents, so this flow only
 * turns a verified ID token into the short-lived respondent session cookie (session.ts) and nothing
 * else — no database row is written for a login.
 *
 * It uses its own Authentik application (`nak-inf-forms-respondents`, hidden from the portal) so that
 * who may use the Formbricks admin UI and who may answer surveys stay two separate decisions.
 */

export const RESPONDENT_SSO_BASE_PATH = "/api/fsinf/respondent-sso";
export const RESPONDENT_SSO_ERROR_PARAM = "fsinfSsoError";
const MAX_RETURN_QUERY_LENGTH = 2000;

export const isRespondentSsoConfigured = (): boolean =>
  Boolean(
    FSINF_RESPONDENT_OIDC_CLIENT_ID && FSINF_RESPONDENT_OIDC_CLIENT_SECRET && FSINF_RESPONDENT_OIDC_ISSUER
  );

export const discoveryUrlFor = (issuer: string): string =>
  `${issuer.replace(/\/+$/, "")}/.well-known/openid-configuration`;

const canonicalOrigin = (): string => new URL(WEBAPP_URL).origin;

export const getRespondentSsoCallbackUrl = (): string =>
  `${canonicalOrigin()}${RESPONDENT_SSO_BASE_PATH}/callback`;

/** The survey link's query string without the SSO flow's own parameters. */
export const sanitizeReturnQuery = (query: string | null | undefined): string => {
  if (!query) return "";
  const trimmed = query.startsWith("?") ? query.slice(1) : query;
  if (trimmed.length > MAX_RETURN_QUERY_LENGTH) return "";
  const params = new URLSearchParams(trimmed);
  params.delete(RESPONDENT_SSO_ERROR_PARAM);
  return params.toString();
};

/**
 * Where the flow returns to. Built from a validated survey id on the canonical origin — never from a
 * caller-supplied URL — so neither the login nor the callback route can be abused as an open redirect.
 */
export const buildSurveyReturnUrl = (surveyId: string, query: string, error?: string): string => {
  const id = ZId.parse(surveyId);
  const params = new URLSearchParams(sanitizeReturnQuery(query));
  if (error) params.set(RESPONDENT_SSO_ERROR_PARAM, error);
  const search = params.toString();
  return `${canonicalOrigin()}/s/${id}${search ? `?${search}` : ""}`;
};

const claimString = (value: unknown): string => (typeof value === "string" ? value.trim() : "");

export const identityFromClaims = (claims: Record<string, unknown>): TRespondentIdentity | null => {
  const sub = claimString(claims.sub);
  if (!sub) return null;
  const username = claimString(claims.preferred_username) || claimString(claims.nickname);
  return {
    sub,
    username,
    email: claimString(claims.email),
    name: claimString(claims.name) || username,
    groups: Array.isArray(claims.groups)
      ? claims.groups.filter((group): group is string => typeof group === "string")
      : [],
  };
};

interface TDiscovery {
  issuer: string;
  authorization_endpoint: string;
  token_endpoint: string;
  jwks_uri: string;
}

const DISCOVERY_TTL_MS = 60 * 60 * 1000;
let discoveryCache: {
  value: TDiscovery;
  jwks: ReturnType<typeof createRemoteJWKSet>;
  fetchedAt: number;
} | null = null;

const getDiscovery = async () => {
  if (discoveryCache && Date.now() - discoveryCache.fetchedAt < DISCOVERY_TTL_MS) return discoveryCache;

  const response = await fetch(discoveryUrlFor(FSINF_RESPONDENT_OIDC_ISSUER ?? ""), {
    cache: "no-store",
    signal: AbortSignal.timeout(5000),
  });
  if (!response.ok) {
    throw new Error(`OIDC discovery failed with HTTP ${response.status}`);
  }
  const value = (await response.json()) as TDiscovery;
  if (!value.authorization_endpoint || !value.token_endpoint || !value.jwks_uri || !value.issuer) {
    throw new Error("OIDC discovery document is incomplete");
  }
  discoveryCache = { value, jwks: createRemoteJWKSet(new URL(value.jwks_uri)), fetchedAt: Date.now() };
  return discoveryCache;
};

const randomToken = (): string => randomBytes(32).toString("base64url");

export const createPkcePair = (): { codeVerifier: string; codeChallenge: string } => {
  const codeVerifier = randomToken();
  const codeChallenge = createHash("sha256").update(codeVerifier).digest("base64url");
  return { codeVerifier, codeChallenge };
};

export const createStateAndNonce = (): { state: string; nonce: string } => ({
  state: randomToken(),
  nonce: randomToken(),
});

export const buildAuthorizationUrl = async ({
  state,
  nonce,
  codeChallenge,
  forceLogin,
}: {
  state: string;
  nonce: string;
  codeChallenge: string;
  /** "Use another account": make Authentik ask again instead of reusing its session. */
  forceLogin?: boolean;
}): Promise<string> => {
  const { value } = await getDiscovery();
  const url = new URL(value.authorization_endpoint);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", FSINF_RESPONDENT_OIDC_CLIENT_ID ?? "");
  url.searchParams.set("redirect_uri", getRespondentSsoCallbackUrl());
  url.searchParams.set("scope", "openid email profile");
  url.searchParams.set("state", state);
  url.searchParams.set("nonce", nonce);
  url.searchParams.set("code_challenge", codeChallenge);
  url.searchParams.set("code_challenge_method", "S256");
  if (forceLogin) url.searchParams.set("prompt", "login");
  return url.toString();
};

/**
 * Redeem the authorization code and verify the ID token (signature via JWKS, issuer, audience, expiry
 * and the nonce bound to this browser's login attempt). Returns null on any failure — the caller sends
 * the respondent back to the survey with an error marker instead of a stack trace.
 */
export const exchangeCodeForIdentity = async ({
  code,
  codeVerifier,
  nonce,
}: {
  code: string;
  codeVerifier: string;
  nonce: string;
}): Promise<TRespondentIdentity | null> => {
  try {
    const { value, jwks } = await getDiscovery();
    const response = await fetch(value.token_endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
        Authorization: `Basic ${Buffer.from(
          `${encodeURIComponent(FSINF_RESPONDENT_OIDC_CLIENT_ID ?? "")}:${encodeURIComponent(
            FSINF_RESPONDENT_OIDC_CLIENT_SECRET ?? ""
          )}`
        ).toString("base64")}`,
      },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: getRespondentSsoCallbackUrl(),
        code_verifier: codeVerifier,
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      logger.error({ status: response.status }, "FSINF respondent SSO: token exchange failed");
      return null;
    }

    const body = (await response.json()) as { id_token?: string };
    if (!body.id_token) {
      logger.error("FSINF respondent SSO: token response carried no id_token");
      return null;
    }

    const { payload } = await jwtVerify(body.id_token, jwks, {
      issuer: value.issuer,
      audience: FSINF_RESPONDENT_OIDC_CLIENT_ID,
    });
    if (payload.nonce !== nonce) {
      logger.warn("FSINF respondent SSO: ID token nonce mismatch");
      return null;
    }

    return identityFromClaims(payload as Record<string, unknown>);
  } catch (error) {
    logger.error(error, "FSINF respondent SSO: login could not be completed");
    return null;
  }
};
