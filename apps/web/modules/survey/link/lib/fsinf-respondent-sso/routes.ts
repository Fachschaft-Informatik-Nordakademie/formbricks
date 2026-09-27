import "server-only";
import { type NextRequest, NextResponse } from "next/server";
import { logger } from "@formbricks/logger";
import { ZId } from "@formbricks/types/common";
import { WEBAPP_URL } from "@/lib/constants";
import {
  RESPONDENT_SSO_BASE_PATH,
  buildAuthorizationUrl,
  buildSurveyReturnUrl,
  createPkcePair,
  createStateAndNonce,
  exchangeCodeForIdentity,
  isRespondentSsoConfigured,
  sanitizeReturnQuery,
} from "./oidc";
import {
  RESPONDENT_LOGIN_STATE_COOKIE,
  RESPONDENT_LOGIN_STATE_TTL_SECONDS,
  RESPONDENT_SESSION_COOKIE,
  RESPONDENT_SESSION_TTL_SECONDS,
  createLoginStateToken,
  createRespondentSessionToken,
  readLoginStateToken,
} from "./session";

/**
 * FSINF: the handlers behind /api/fsinf/respondent-sso/{login,callback,logout}.
 *
 * All three only ever run on the canonical origin (WEBAPP_URL): the login hops there first, Authentik's
 * redirect_uri points there, and the survey page is sent back there. That keeps the cookies, the
 * survey page and the response API on one origin — which is what lets the response endpoints see the
 * session cookie at all (the survey client's fetch sends cookies only same-origin).
 */

const isSecure = (): boolean => WEBAPP_URL.startsWith("https://");

const cookieBase = () => ({ httpOnly: true, secure: isSecure(), sameSite: "lax" as const });

const noStore = (response: NextResponse): NextResponse => {
  response.headers.set("Cache-Control", "private, no-store");
  return response;
};

const plainError = (status: number, message: string) =>
  noStore(new NextResponse(message, { status, headers: { "Content-Type": "text/plain; charset=utf-8" } }));

const isOnCanonicalOrigin = (request: NextRequest): boolean => {
  const canonical = new URL(WEBAPP_URL);
  const forwardedHost = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  return !forwardedHost || forwardedHost.toLowerCase() === canonical.host.toLowerCase();
};

export const handleRespondentLogin = async (request: NextRequest): Promise<NextResponse> => {
  const { searchParams } = request.nextUrl;
  const surveyId = searchParams.get("surveyId") ?? "";
  if (!ZId.safeParse(surveyId).success) return plainError(400, "Invalid survey id");
  if (!isRespondentSsoConfigured()) return plainError(503, "SSO login for surveys is not configured");

  const query = sanitizeReturnQuery(searchParams.get("query"));
  const forceLogin = searchParams.get("switch") === "1";

  // Started from the second domain (forms.nak-studis.de)? Restart on the canonical one, so the state
  // cookie is set where the callback will read it.
  if (!isOnCanonicalOrigin(request)) {
    const canonicalLogin = new URL(`${RESPONDENT_SSO_BASE_PATH}/login`, WEBAPP_URL);
    searchParams.forEach((value, key) => canonicalLogin.searchParams.set(key, value));
    return noStore(NextResponse.redirect(canonicalLogin));
  }

  const { state, nonce } = createStateAndNonce();
  const { codeVerifier, codeChallenge } = createPkcePair();

  let authorizationUrl: string;
  try {
    authorizationUrl = await buildAuthorizationUrl({ state, nonce, codeChallenge, forceLogin });
  } catch (error) {
    logger.error(error, "FSINF respondent SSO: Authentik is not reachable for login");
    return noStore(NextResponse.redirect(buildSurveyReturnUrl(surveyId, query, "unavailable")));
  }

  const response = noStore(NextResponse.redirect(authorizationUrl));
  response.cookies.set(
    RESPONDENT_LOGIN_STATE_COOKIE,
    createLoginStateToken({ state, nonce, codeVerifier, surveyId, query }),
    {
      ...cookieBase(),
      path: RESPONDENT_SSO_BASE_PATH,
      maxAge: RESPONDENT_LOGIN_STATE_TTL_SECONDS,
    }
  );
  return response;
};

export const handleRespondentCallback = async (request: NextRequest): Promise<NextResponse> => {
  const loginState = readLoginStateToken(request.cookies.get(RESPONDENT_LOGIN_STATE_COOKIE)?.value);
  if (!loginState) {
    // No (or expired) login attempt in this browser: nothing to return to that we could trust.
    return plainError(400, "Login attempt expired — please open the survey link again.");
  }

  const { searchParams } = request.nextUrl;
  const clearState = (response: NextResponse) => {
    response.cookies.set(RESPONDENT_LOGIN_STATE_COOKIE, "", {
      ...cookieBase(),
      path: RESPONDENT_SSO_BASE_PATH,
      maxAge: 0,
    });
    return noStore(response);
  };
  const backWithError = (error: string) =>
    clearState(NextResponse.redirect(buildSurveyReturnUrl(loginState.surveyId, loginState.query, error)));

  if (searchParams.get("state") !== loginState.state) return backWithError("state");
  if (searchParams.get("error")) return backWithError("denied");

  const code = searchParams.get("code");
  if (!code) return backWithError("state");

  const identity = await exchangeCodeForIdentity({
    code,
    codeVerifier: loginState.codeVerifier,
    nonce: loginState.nonce,
  });
  if (!identity) return backWithError("failed");

  const response = clearState(
    NextResponse.redirect(buildSurveyReturnUrl(loginState.surveyId, loginState.query))
  );
  response.cookies.set(RESPONDENT_SESSION_COOKIE, createRespondentSessionToken(identity), {
    ...cookieBase(),
    path: "/",
    maxAge: RESPONDENT_SESSION_TTL_SECONDS,
  });
  return response;
};

/** Forget the respondent session; with `switch=1` go straight into a forced re-login. */
export const handleRespondentLogout = async (request: NextRequest): Promise<NextResponse> => {
  const { searchParams } = request.nextUrl;
  const surveyId = searchParams.get("surveyId") ?? "";
  if (!ZId.safeParse(surveyId).success) return plainError(400, "Invalid survey id");
  const query = sanitizeReturnQuery(searchParams.get("query"));

  const target =
    searchParams.get("switch") === "1"
      ? new URL(
          `${RESPONDENT_SSO_BASE_PATH}/login?${new URLSearchParams({ surveyId, query, switch: "1" })}`,
          WEBAPP_URL
        ).toString()
      : buildSurveyReturnUrl(surveyId, query);

  const response = noStore(NextResponse.redirect(target));
  response.cookies.set(RESPONDENT_SESSION_COOKIE, "", { ...cookieBase(), path: "/", maxAge: 0 });
  return response;
};
